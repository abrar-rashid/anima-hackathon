from __future__ import annotations
import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()

def read(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def write(path: Path, value: Any) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.' + uuid.uuid4().hex + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    for attempt in range(8):
        try:tmp.replace(path);return
        except PermissionError:
            if attempt==7:raise
            time.sleep(min(.05*2**attempt,.5))

def load_env() -> None:
    # Never execute dotenv content. Never read another project's credentials implicitly.
    path = ROOT / '.env'
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and key in {'ANIMA_API_KEY','MEDLATENCY_PROVIDER','LLM_API_KEY','LLM_MODEL','LLM_BASE_URL','MEDLATENCY_DB'}:
                os.environ.setdefault(key, value.strip().strip('"\''))

def pointer(value: Any, path: str) -> Any:
    if path == '': return value
    if not path.startswith('/'): raise ValueError('JSON pointer must start with /')
    for part in path[1:].split('/'):
        part = part.replace('~1','/').replace('~0','~')
        value = value[int(part)] if isinstance(value,list) else value[part]
    return value

def leaves(value: Any, path: str = ''):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from leaves(child, path + '/' + str(key).replace('~','~0').replace('/','~1'))
    elif isinstance(value,list):
        for i, child in enumerate(value): yield from leaves(child, path + '/' + str(i))
    else: yield path,value

def instant(value):
    if value is None: return None
    try:
        if isinstance(value,(float,int)) and not isinstance(value,bool): return datetime.fromtimestamp(value/1000,timezone.utc)
        dt = datetime.fromisoformat(value.replace('Z','+00:00'))
        return dt if dt.tzinfo else None
    except (ValueError,TypeError,OverflowError,OSError): return None
