import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SECRET_CONFIG_PATH = Path("/etc/secrets/image_api_config.json")
CONFIG_PATH = BASE_DIR / "image_api_config.json"
LEGACY_CONFIG_PATH = BASE_DIR / "supai_config.json"

DEFAULT_CONFIG = {
    "active_provider": "siliconflow",
    "providers": {
        "supai": {
            "api_key": "",
            "api_url": "",
            "model": "",
            "size": "1024x1024",
            "timeout": 600,
            "retries": 2,
        },
        "siliconflow": {
            "api_key": "",
            "api_url": "https://api.siliconflow.cn/v1/images/generations",
            "model": "Kwai-Kolors/Kolors",
            "size": "768x768",
            "timeout": 600,
            "retries": 2,
        },
    },
}

_active_provider_override: str | None = None


def _merge_config(base: dict, override: dict) -> dict:
    result = json.loads(json.dumps(base))
    if not isinstance(override, dict):
        return result

    if override.get("active_provider"):
        result["active_provider"] = override["active_provider"]

    providers = override.get("providers")
    if isinstance(providers, dict):
        for name, provider_config in providers.items():
            if name not in result["providers"]:
                result["providers"][name] = {}
            if isinstance(provider_config, dict):
                result["providers"][name].update(
                    {key: value for key, value in provider_config.items() if value not in [None, ""]}
                )
    else:
        result["providers"]["supai"].update(
            {key: value for key, value in override.items() if value not in [None, ""]}
        )

    return result


def load_raw_config() -> dict:
    config = DEFAULT_CONFIG
    for path in [SECRET_CONFIG_PATH, CONFIG_PATH, LEGACY_CONFIG_PATH]:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                config = _merge_config(config, json.load(f))
            break
    return config


def list_providers() -> list[str]:
    return list(load_raw_config().get("providers", {}).keys())


def get_active_provider() -> str:
    return _active_provider_override or os.getenv("IMAGE_API_PROVIDER") or load_raw_config().get("active_provider", "supai")


def set_active_provider(provider: str) -> dict:
    global _active_provider_override
    providers = load_raw_config().get("providers", {})
    if provider not in providers:
        raise ValueError(f"未知生图服务：{provider}")
    _active_provider_override = provider
    return load_image_config(provider)


def load_image_config(provider: str | None = None) -> dict:
    raw = load_raw_config()
    active_provider = provider or get_active_provider()
    providers = raw.get("providers", {})
    if active_provider not in providers:
        active_provider = "supai"

    config = providers[active_provider].copy()
    config["provider"] = active_provider

    if config.get("api_key") in ["在这里填写你的 SupAI API Key", "在这里填写你的 SiliconFlow API Key"]:
        config["api_key"] = ""

    env_prefix = "SILICONFLOW" if active_provider == "siliconflow" else "SUPAI"
    config["api_key"] = config.get("api_key") or os.getenv(f"{env_prefix}_API_KEY") or os.getenv("IMAGE_API_KEY") or ""
    config["api_url"] = config.get("api_url") or os.getenv(f"{env_prefix}_IMAGE_API_URL") or os.getenv("IMAGE_API_URL") or ""
    config["model"] = config.get("model") or os.getenv(f"{env_prefix}_IMAGE_MODEL") or os.getenv("IMAGE_API_MODEL") or ""
    config["size"] = config.get("size") or os.getenv(f"{env_prefix}_IMAGE_SIZE") or os.getenv("IMAGE_API_SIZE") or "1024x1024"
    config["timeout"] = int(config.get("timeout") or os.getenv(f"{env_prefix}_IMAGE_TIMEOUT") or os.getenv("IMAGE_API_TIMEOUT") or 600)
    config["retries"] = int(config.get("retries") or os.getenv("IMAGE_API_RETRIES") or 2)

    return config
