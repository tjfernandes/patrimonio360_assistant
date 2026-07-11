"""Guard against the Settings(extra="ignore") trap.

Every key present in the backend .env / .env.example files must be a declared
field on ``Settings``. Undeclared keys are silently dropped by pydantic
(``extra="ignore"``), which has already disabled a whole feature once (the
reranker settings existed only in .env and were never read).
"""

from __future__ import annotations

import importlib
from pathlib import Path
import sys
import unittest

# test_opensearch_mapping_fields installs a stub "pydantic_settings" module when
# imported first (to run without the dependency). Evict any stub so this test
# always exercises the real pydantic Settings class.
_stub = sys.modules.get("pydantic_settings")
if _stub is not None and getattr(_stub, "__file__", None) is None:
    del sys.modules["pydantic_settings"]
    sys.modules.pop("app.core.config", None)

import app.core.config as _config_module

_config_module = importlib.reload(_config_module) if not hasattr(
    _config_module.Settings, "model_fields"
) else _config_module
Settings = _config_module.Settings

_BACKEND_DIR = Path(__file__).resolve().parents[1]

# Keys intentionally allowed to exist in .env without a Settings declaration
# (consumed by other tooling, not by the backend app).
_ALLOWED_UNDECLARED: set[str] = set()


def _env_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    if not path.exists():
        return keys
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export "):]
        key = stripped.partition("=")[0].strip()
        if key:
            keys.add(key)
    return keys


class SettingsEnvParityTest(unittest.TestCase):
    def test_all_env_keys_are_declared_settings_fields(self) -> None:
        declared = set(Settings.model_fields.keys())
        checked_any = False
        for env_name in (".env", ".env.example"):
            env_path = _BACKEND_DIR / env_name
            keys = _env_keys(env_path)
            if not keys:
                continue
            checked_any = True
            undeclared = sorted(keys - declared - _ALLOWED_UNDECLARED)
            self.assertEqual(
                undeclared,
                [],
                msg=(
                    f"{env_name} contains keys not declared on Settings "
                    f"(silently ignored by pydantic): {undeclared}. "
                    "Declare them in app/core/config.py or add to "
                    "_ALLOWED_UNDECLARED with a justification."
                ),
            )
        self.assertTrue(checked_any, "No .env/.env.example file found to check.")

    def test_reranker_settings_are_declared(self) -> None:
        declared = set(Settings.model_fields.keys())
        required = {
            "CHAT_ENABLE_RERANKING",
            "RERANKER_MODEL_ID",
            "RERANKER_MAX_LENGTH",
            "RERANKER_BATCH_SIZE",
            "RERANKER_INSTRUCTION",
            "RERANKER_PREFER_BF16",
        }
        self.assertEqual(sorted(required - declared), [])

    def test_reranker_model_resolved_property(self) -> None:
        settings = Settings(RERANKER_MODEL_ID="  ")
        self.assertEqual(settings.reranker_model_resolved, "Qwen/Qwen3-Reranker-4B")


if __name__ == "__main__":
    unittest.main()
