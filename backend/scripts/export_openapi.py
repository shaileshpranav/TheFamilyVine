"""Write the OpenAPI schema to a file so the frontend can generate typed API bindings."""

import json
import sys

from app.main import app

path = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"
with open(path, "w") as f:
    json.dump(app.openapi(), f, indent=2)
