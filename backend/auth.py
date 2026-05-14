import secrets
from time import time
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from authlib.jose import JsonWebKey, JsonWebToken
from defusedxml import ElementTree
from fastapi import APIRouter, HTTPException, Request, WebSocket
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

AUTH_SESSION_KEY = "auth_user"
OIDC_SESSION_KEY = "oidc_auth"
NEXT_SESSION_KEY = "auth_next"


def is_safe_next(next_path: str | None) -> str:
    if not next_path:
        return "/"
    parsed = urlparse(next_path)
    if parsed.scheme or parsed.netloc or next_path.startswith("//"):
        return "/"
    if not next_path.startswith("/"):
        return "/"
    return next_path


def build_url(base_url: str, path: str, params: dict[str, Any] | None = None) -> str:
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    if params:
        return f"{url}?{urlencode(params)}"
    return url


def get_current_user(request: Request) -> dict | None:
    user = request.session.get(AUTH_SESSION_KEY)
    return user if isinstance(user, dict) else None


def require_current_user(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先通过南昌大学门户认证")
    return user


def require_websocket_user(websocket: WebSocket) -> dict | None:
    user = websocket.session.get(AUTH_SESSION_KEY)
    return user if isinstance(user, dict) else None


def add_session_middleware(app, config: dict) -> None:
    if not config.get("enabled"):
        return
    app.add_middleware(
        SessionMiddleware,
        secret_key=config["secret_key"],
        session_cookie=config.get("cookie_name") or "dreamclass_auth",
        same_site="lax",
        https_only=bool(config.get("cookie_secure")),
    )


def is_public_path(path: str) -> bool:
    return (
        path == "/api/auth/status"
        or path.startswith("/auth/")
        or path.startswith("/assets/")
        or path in {"/favicon.ico", "/robots.txt"}
    )


def should_protect_path(path: str, config: dict) -> bool:
    if not config.get("enabled") or is_public_path(path):
        return False
    if path.startswith("/api/") or path == "/ws":
        return True
    if path.startswith("/static/"):
        return bool(config.get("require_auth_for_static", True))
    return False


def auth_error_response(path: str) -> JSONResponse:
    return JSONResponse(
        {"detail": "请先通过南昌大学门户认证", "loginUrl": f"/auth/login?next={path}"},
        status_code=401,
    )


async def load_oidc_metadata(config: dict) -> dict:
    oidc = config.get("oidc", {})
    if oidc.get("discovery_url"):
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(oidc["discovery_url"])
            res.raise_for_status()
            metadata = res.json()
    else:
        metadata = {}

    return {
        "issuer": oidc.get("issuer") or metadata.get("issuer") or "",
        "authorization_endpoint": oidc.get("authorization_endpoint") or metadata.get("authorization_endpoint") or "",
        "token_endpoint": oidc.get("token_endpoint") or metadata.get("token_endpoint") or "",
        "userinfo_endpoint": oidc.get("userinfo_endpoint") or metadata.get("userinfo_endpoint") or "",
        "jwks_uri": oidc.get("jwks_uri") or metadata.get("jwks_uri") or "",
    }


async def oidc_login(request: Request, config: dict, next_path: str) -> RedirectResponse:
    oidc = config["oidc"]
    metadata = await load_oidc_metadata(config)
    if not metadata["authorization_endpoint"]:
        raise HTTPException(status_code=500, detail="OIDC authorization endpoint 未配置")

    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    request.session[OIDC_SESSION_KEY] = {"state": state, "nonce": nonce}
    request.session[NEXT_SESSION_KEY] = next_path

    params = {
        "response_type": "code",
        "client_id": oidc["client_id"],
        "redirect_uri": build_url(config["public_base_url"], "/auth/callback"),
        "scope": oidc.get("scopes") or "openid profile email",
        "state": state,
        "nonce": nonce,
    }
    return RedirectResponse(f"{metadata['authorization_endpoint']}?{urlencode(params)}")


async def oidc_callback(request: Request, config: dict) -> RedirectResponse:
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    saved = request.session.get(OIDC_SESSION_KEY) or {}
    if not code or not state or state != saved.get("state"):
        raise HTTPException(status_code=400, detail="OIDC 回调校验失败")

    oidc = config["oidc"]
    metadata = await load_oidc_metadata(config)
    if not metadata["token_endpoint"]:
        raise HTTPException(status_code=500, detail="OIDC token endpoint 未配置")

    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": build_url(config["public_base_url"], "/auth/callback"),
        "client_id": oidc["client_id"],
        "client_secret": oidc["client_secret"],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        token_res = await client.post(metadata["token_endpoint"], data=token_data)
        token_res.raise_for_status()
        token = token_res.json()

        claims = {}
        if token.get("id_token") and metadata.get("jwks_uri"):
            jwks_res = await client.get(metadata["jwks_uri"])
            jwks_res.raise_for_status()
            key_set = JsonWebKey.import_key_set(jwks_res.json())
            claims_options = {
                "aud": {"essential": True, "values": [oidc["client_id"]]},
                "nonce": {"essential": True, "value": saved.get("nonce")},
            }
            if metadata.get("issuer"):
                claims_options["iss"] = {"essential": True, "values": [metadata["issuer"]]}
            claims = JsonWebToken(["RS256", "RS384", "RS512", "ES256"]).decode(
                token["id_token"],
                key_set,
                claims_options=claims_options,
            )
            claims.validate(leeway=60)

        if metadata.get("userinfo_endpoint") and token.get("access_token"):
            userinfo_res = await client.get(
                metadata["userinfo_endpoint"],
                headers={"Authorization": f"Bearer {token['access_token']}"},
            )
            userinfo_res.raise_for_status()
            claims.update(userinfo_res.json())

    if not claims:
        raise HTTPException(status_code=400, detail="未能获取门户用户信息")

    username_claim = oidc.get("username_claim") or "preferred_username"
    display_claim = oidc.get("display_name_claim") or "name"
    email_claim = oidc.get("email_claim") or "email"
    username = claims.get(username_claim) or claims.get("sub")
    if not username:
        raise HTTPException(status_code=400, detail="门户返回信息中缺少用户标识")

    request.session[AUTH_SESSION_KEY] = {
        "authenticated": True,
        "provider": "oidc",
        "subject": claims.get("sub") or str(username),
        "username": str(username),
        "displayName": str(claims.get(display_claim) or username),
        "email": str(claims.get(email_claim) or ""),
        "issuedAt": int(time()),
    }
    request.session.pop(OIDC_SESSION_KEY, None)
    next_path = is_safe_next(request.session.pop(NEXT_SESSION_KEY, "/"))
    return RedirectResponse(next_path)


def cas_service_url(config: dict, next_path: str) -> str:
    return build_url(config["public_base_url"], "/auth/callback", {"next": next_path})


def cas_login(request: Request, config: dict, next_path: str) -> RedirectResponse:
    request.session[NEXT_SESSION_KEY] = next_path
    service = cas_service_url(config, next_path)
    return RedirectResponse(f"{config['cas']['login_url']}?{urlencode({'service': service})}")


def _xml_text(node) -> str:
    return node.text.strip() if node is not None and node.text else ""


async def cas_callback(request: Request, config: dict) -> RedirectResponse:
    ticket = request.query_params.get("ticket")
    next_path = is_safe_next(request.query_params.get("next") or request.session.get(NEXT_SESSION_KEY))
    if not ticket:
        raise HTTPException(status_code=400, detail="CAS 回调缺少 ticket")

    service = cas_service_url(config, next_path)
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get(config["cas"]["validate_url"], params={"service": service, "ticket": ticket})
        res.raise_for_status()

    root = ElementTree.fromstring(res.text)
    success = root.find(".//{*}authenticationSuccess")
    if success is None:
        raise HTTPException(status_code=401, detail="CAS ticket 校验失败")

    user_node = success.find(".//{*}user")
    username = _xml_text(user_node)
    attributes = success.find(".//{*}attributes")
    attr_values = {}
    if attributes is not None:
        for child in list(attributes):
            key = child.tag.split("}")[-1]
            attr_values[key] = _xml_text(child)

    cas = config["cas"]
    username = attr_values.get(cas.get("username_attribute") or "user") or username
    if not username:
        raise HTTPException(status_code=400, detail="CAS 返回信息中缺少用户标识")

    display_name = attr_values.get(cas.get("display_name_attribute") or "displayName") or username
    email = attr_values.get(cas.get("email_attribute") or "email") or ""
    request.session[AUTH_SESSION_KEY] = {
        "authenticated": True,
        "provider": "cas",
        "subject": username,
        "username": username,
        "displayName": display_name,
        "email": email,
        "issuedAt": int(time()),
    }
    request.session.pop(NEXT_SESSION_KEY, None)
    return RedirectResponse(next_path)


def dev_login(request: Request, config: dict, next_path: str) -> RedirectResponse:
    dev = config.get("dev", {})
    request.session[AUTH_SESSION_KEY] = {
        "authenticated": True,
        "provider": "dev",
        "subject": dev.get("username") or "ncu-demo-user",
        "username": dev.get("username") or "ncu-demo-user",
        "displayName": dev.get("display_name") or "南昌大学演示用户",
        "email": dev.get("email") or "",
        "issuedAt": int(time()),
    }
    return RedirectResponse(next_path)


def create_auth_router(config: dict) -> APIRouter:
    router = APIRouter()

    @router.get("/api/auth/status")
    async def auth_status(request: Request):
        user = get_current_user(request) if config.get("enabled") else None
        return {
            "enabled": bool(config.get("enabled")),
            "authenticated": bool(user) or not config.get("enabled"),
            "user": user,
            "provider": config.get("provider"),
            "loginUrl": "/auth/login",
            "logoutUrl": "/auth/logout",
        }

    @router.get("/auth/login")
    async def login(request: Request, next: str = "/"):
        next_path = is_safe_next(next)
        if not config.get("enabled"):
            return RedirectResponse(next_path)
        provider = config.get("provider")
        if provider == "oidc":
            return await oidc_login(request, config, next_path)
        if provider == "cas":
            return cas_login(request, config, next_path)
        if provider == "dev" and config.get("dev", {}).get("enabled"):
            return dev_login(request, config, next_path)
        raise HTTPException(status_code=500, detail="认证方式未正确配置")

    @router.get("/auth/callback")
    async def callback(request: Request):
        provider = config.get("provider")
        if provider == "oidc":
            return await oidc_callback(request, config)
        if provider == "cas":
            return await cas_callback(request, config)
        raise HTTPException(status_code=400, detail="当前认证方式不需要回调")

    @router.post("/auth/logout")
    async def logout_post(request: Request):
        if config.get("enabled"):
            request.session.clear()
        return {"ok": True, "loginUrl": "/auth/login"}

    @router.get("/auth/logout")
    async def logout_get(request: Request):
        if config.get("enabled"):
            request.session.clear()
        logout_url = config.get("cas", {}).get("logout_url") if config.get("provider") == "cas" else ""
        return RedirectResponse(logout_url or "/")

    return router
