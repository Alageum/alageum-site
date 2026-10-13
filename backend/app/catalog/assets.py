"""Allow only versioned assets actually shipped with this catalog release.

The backend image does not contain the frontend public tree. This checked-in manifest
is generated from it; tests verify that every entry exists and every imported image
is included. New media requires adding a real public asset and regenerating the list.
"""

import json
from functools import lru_cache
from pathlib import Path


@lru_cache
def public_assets() -> frozenset[str]:
    return frozenset(json.loads(Path(__file__).with_name("public_assets.json").read_text()))
