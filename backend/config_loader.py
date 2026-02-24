# backend/config_loader.py
import json
import os
from pathlib import Path
from typing import Any, Dict

CONFIG_PATH = Path(__file__).parent.parent / "config.json"


class ConfigValidationError(Exception):
    pass


REQUIRED_KEYS = [
    ("ai", "provider"),
    ("database", "url"),
    ("redis", "url"),
    ("client", "linkedin_email"),
    ("content_mode",),
    ("behavior", "min_delay_between_actions_seconds"),
    ("dashboard", "secret_key"),
]


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise ConfigValidationError(f"config.json not found at {CONFIG_PATH}")

    with open(CONFIG_PATH, "r") as f:
        try:
            config = json.load(f)
        except json.JSONDecodeError as e:
            raise ConfigValidationError(f"config.json is malformed: {e}")

    _validate(config)
    _inject_env_secrets(config)

    return config


def _validate(config: Dict[str, Any]) -> None:
    for key_path in REQUIRED_KEYS:
        node = config
        for key in key_path:
            if not isinstance(node, dict) or key not in node:
                raise ConfigValidationError(
                    f"Missing required config key: {' -> '.join(key_path)}"
                )
            node = node[key]

    valid_providers = {"ollama", "anthropic", "openai"}
    provider = config["ai"]["provider"]
    if provider not in valid_providers:
        raise ConfigValidationError(
            f"ai.provider must be one of {valid_providers}, got '{provider}'"
        )

    valid_modes = {"ai_suggested", "owner_specified"}
    mode = config["content_mode"]
    if mode not in valid_modes:
        raise ConfigValidationError(
            f"content_mode must be one of {valid_modes}, got '{mode}'"
        )

    min_d = config["behavior"]["min_delay_between_actions_seconds"]
    max_d = config["behavior"]["max_delay_between_actions_seconds"]
    if min_d >= max_d:
        raise ConfigValidationError(
            "behavior.min_delay must be less than behavior.max_delay"
        )


def _inject_env_secrets(config: Dict[str, Any]) -> None:
    """
    Override sensitive config values from environment variables if present.
    This allows .env to take precedence over config.json for secrets.
    """
    env_map = {
        ("ai", "anthropic", "api_key"): "ANTHROPIC_API_KEY",
        ("ai", "openai", "api_key"): "OPENAI_API_KEY",
        ("client", "linkedin_email"): "LINKEDIN_EMAIL",
        ("client", "linkedin_password"): "LINKEDIN_PASSWORD",
        ("dashboard", "secret_key"): "DASHBOARD_SECRET_KEY",
    }

    for key_path, env_var in env_map.items():
        val = os.getenv(env_var)
        if val:
            node = config
            for key in key_path[:-1]:
                node = node.setdefault(key, {})
            node[key_path[-1]] = val


# Singleton — load once at startup
_config: Dict[str, Any] = None


def get_config() -> Dict[str, Any]:
    global _config
    if _config is None:
        _config = load_config()
    return _config
