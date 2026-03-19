import json
from pathlib import Path

# Look for config.json next to this file first (standalone install),
# then fall back to the original vault location (Eytan's setup)
_LOCAL = Path(__file__).parent / "config.json"
_LEGACY = Path(__file__).parent.parent.parent / "08_Dream" / "config.json"
_CONFIG_PATH = _LOCAL if _LOCAL.exists() else _LEGACY


def load_config() -> dict:
    with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_vault_path() -> Path:
    config = load_config()
    vault_raw = config.get("vault_path", "../../")
    vault = (Path(__file__).parent / vault_raw).resolve()
    return vault


def get_port() -> int:
    return load_config().get("port", 7844)


def is_ai_enabled() -> bool:
    return load_config().get("ai_enabled", False)
