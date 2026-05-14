import ipaddress
import os
from typing import Any

DEFAULT_ALLOWED_PRIVATE_CIDRS = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8,::1/128"


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def load_access_config() -> dict:
    mode = os.getenv("ACCESS_CONTROL_MODE", "none")
    if str(mode).lower() in {"true", "campus", "campus_ip"}:
        mode = "campus_ip"
    elif str(mode).lower() in {"false", "none", "off", "disabled"}:
        mode = "none"

    allowed_cidrs = os.getenv("CAMPUS_ALLOWED_CIDRS", "")
    allow_private = _bool(os.getenv("CAMPUS_ALLOW_PRIVATE_IPS", "true"))
    if allow_private:
        allowed_cidrs = ",".join(item for item in [allowed_cidrs, DEFAULT_ALLOWED_PRIVATE_CIDRS] if item)

    networks = []
    for item in allowed_cidrs.split(","):
        item = item.strip()
        if not item:
            continue
        networks.append(ipaddress.ip_network(item, strict=False))

    return {
        "mode": str(mode).lower(),
        "networks": networks,
        "trusted_proxy_headers": _bool(os.getenv("TRUST_PROXY_HEADERS", "true")),
    }


def get_client_ip(request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip", "")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else ""


def is_allowed_ip(ip: str, config: dict) -> bool:
    if config.get("mode") != "campus_ip":
        return True
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(address in network for network in config.get("networks", []))


def access_denied_payload(ip: str) -> dict:
    return {
        "detail": "请连接南昌大学校园网后再使用本服务",
        "clientIp": ip,
    }
