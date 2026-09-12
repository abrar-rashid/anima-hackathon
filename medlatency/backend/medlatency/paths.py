from __future__ import annotations

from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = PACKAGE_DIR.parent
ROOT = BACKEND_DIR.parent
SCHEMAS_DIR = ROOT / "schemas"
CONFIG_DIR = ROOT / "config"
FIXTURES_DIR = ROOT / "fixtures"
PATIENT_FIXTURES_DIR = FIXTURES_DIR / "patients"
EXPECTED_DIR = FIXTURES_DIR / "expected"
REPLAY_DIR = FIXTURES_DIR / "replay"
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
BUNDLES_DIR = DATA_DIR / "bundles"
OUTPUTS_DIR = ROOT / "outputs"
ANALYSES_DIR = OUTPUTS_DIR / "analyses"
PITCH_DIR = OUTPUTS_DIR / "pitch"
VIEWER_DIR = ROOT / "viewer"
VAR_DIR = ROOT / "var"


def ensure_runtime_dirs() -> None:
    for path in (RAW_DIR, BUNDLES_DIR, ANALYSES_DIR, PITCH_DIR, VAR_DIR):
        path.mkdir(parents=True, exist_ok=True)
