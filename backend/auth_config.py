import json
import os
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
SECRET_CONFIG_PATH = Path("/etc/secrets/auth_config.json")
CONFIG_PATH = BASE_DIR / "auth_config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": False,
    "provider": "oidc",
    "public_base_url": "http://127.0.0.1:8000",
    "secret_key": "",
    "cookie_name": "dreamclass_auth",
    "cookie_secure": False,
    "allowed_origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
    "require_auth_for_static": True,
    "oidc": {
        "discovery_url": "",
        "issuer": "",
        "client_id": "",
        "client_secret": "",
        "scopes": "openid profile email",
        "authorization_endpoint": "",
        "token_endpoint": "",
        "userinfo_endpoint": "",
        "jwks_uri": "",
        "username_claim": "preferred_username",
        "display_name_claim": "name",
        "email_claim": "email",
    },
    "cas": {
        "login_url": "",
        "validate_url": "",
        "logout_url": "",
        "username_attribute": "user",
        "display_name_attribute": "displayName",
        "email_attribute": "email",
    },
    "dev": {
        "enabled": False,
        "username": "ncu-demo-user",
        "display_name": "南昌大学演示用户",
        "email": "",
    },
}


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if not value:
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _merge_config(base: dict, override: dict) -> dict:
    result = json.loads(json.dumps(base))
    if not isinstance(override, dict):
        return result

    for key, value in override.items():
        if value in [None, ""]:
            continue
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key].update({k: v for k, v in value.items() if v not in [None, ""]})
        else:
            result[key] = value
    return result


def _apply_env(config: dict) -> dict:
    env_map = {
        "AUTH_ENABLED": ("enabled", _bool),
        "AUTH_PROVIDER": ("provider", str),
        "AUTH_PUBLIC_BASE_URL": ("public_base_url", str),
        "AUTH_SECRET_KEY": ("secret_key", str),
        "AUTH_COOKIE_NAME": ("cookie_name", str),
        "AUTH_COOKIE_SECURE": ("cookie_secure", _bool),
        "AUTH_ALLOWED_ORIGINS": ("allowed_origins", _list),
        "AUTH_REQUIRE_AUTH_FOR_STATIC": ("require_auth_for_static", _bool),
    }
    for env_name, (key, caster) in env_map.items():
        if env_name in os.environ:
            config[key] = caster(os.getenv(env_name))

    nested_env = {
        "oidc": {
            "AUTH_OIDC_DISCOVERY_URL": "discovery_url",
            "AUTH_OIDC_ISSUER": "issuer",
            "AUTH_OIDC_CLIENT_ID": "client_id",
            "AUTH_OIDC_CLIENT_SECRET": "client_secret",
            "AUTH_OIDC_SCOPES": "scopes",
            "AUTH_OIDC_AUTHORIZATION_ENDPOINT": "authorization_endpoint",
            "AUTH_OIDC_TOKEN_ENDPOINT": "token_endpoint",
            "AUTH_OIDC_USERINFO_ENDPOINT": "userinfo_endpoint",
            "AUTH_OIDC_JWKS_URI": "jwks_uri",
            "AUTH_OIDC_USERNAME_CLAIM": "username_claim",
            "AUTH_OIDC_DISPLAY_NAME_CLAIM": "display_name_claim",
            "AUTH_OIDC_EMAIL_CLAIM": "email_claim",
        },
        "cas": {
            "AUTH_CAS_LOGIN_URL": "login_url",
            "AUTH_CAS_VALIDATE_URL": "validate_url",
            "AUTH_CAS_LOGOUT_URL": "logout_url",
            "AUTH_CAS_USERNAME_ATTRIBUTE": "username_attribute",
            "AUTH_CAS_DISPLAY_NAME_ATTRIBUTE": "display_name_attribute",
            "AUTH_CAS_EMAIL_ATTRIBUTE": "email_attribute",
        },
        "dev": {
            "AUTH_DEV_LOGIN_ENABLED": "enabled",
            "AUTH_DEV_USERNAME": "username",
            "AUTH_DEV_DISPLAY_NAME": "display_name",
            "AUTH_DEV_EMAIL": "email",
        },
    }
    for section, values in nested_env.items():
        for env_name, key in values.items():
            if env_name in os.environ:
                config[section][key] = _bool(os.getenv(env_name)) if key == "enabled" else os.getenv(env_name)

    if isinstance(config.get("allowed_origins"), str):
        config["allowed_origins"] = _list(config["allowed_origins"])
    return config


def load_auth_config() -> dict:
    config = DEFAULT_CONFIG
    for path in [SECRET_CONFIG_PATH, CONFIG_PATH]:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                config = _merge_config(config, json.load(f))
            break

    config = _apply_env(json.loads(json.dumps(config)))
    config["enabled"] = _bool(config.get("enabled"))
    config["cookie_secure"] = _bool(config.get("cookie_secure"))
    config["require_auth_for_static"] = _bool(config.get("require_auth_for_static"))
    config["provider"] = str(config.get("provider") or "oidc").lower()
    return config


def validate_auth_config(config: dict) -> None:
    if not config.get("enabled"):
        return
    if not config.get("secret_key"):
        raise RuntimeError("AUTH_SECRET_KEY 未配置，认证开启时必须设置稳定的会话密钥")

    provider = config.get("provider")
    if provider == "oidc":
        oidc = config.get("oidc", {})
        if not oidc.get("client_id"):
            raise RuntimeError("AUTH_OIDC_CLIENT_ID 未配置")
        if not oidc.get("client_secret"):
            raise RuntimeError("AUTH_OIDC_CLIENT_SECRET 未配置")
        if not (oidc.get("discovery_url") or (oidc.get("authorization_endpoint") and oidc.get("token_endpoint"))):
            raise RuntimeError("请配置 OIDC discovery_url，或同时配置 authorization_endpoint/token_endpoint")
    elif provider == "cas":
        cas = config.get("cas", {})
        if not cas.get("login_url") or not cas.get("validate_url"):
            raise RuntimeError("请配置 AUTH_CAS_LOGIN_URL 和 AUTH_CAS_VALIDATE_URL")
    elif provider == "dev":
        if not config.get("dev", {}).get("enabled"):
            raise RuntimeError("AUTH_PROVIDER=dev 仅可在 AUTH_DEV_LOGIN_ENABLED=true 时用于本地测试")
    else:
        raise RuntimeError(f"未知认证方式：{provider}")
