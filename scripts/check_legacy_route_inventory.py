"""Check declaration presence only; this does not certify behavior or data parity."""

import argparse
import ast
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGET = ROOT / "docs/node-legacy-route-inventory.json"
METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}
SYSTEM = {"/api/v1/health", "/api/v1/readiness", "/api/v1/metrics", "/api/v1/version"}


def normalize(path):
    return re.sub(r"\{[^{}]+\}|:[A-Za-z_][A-Za-z0-9_]*", "{param}", path)


def build():
    api_file = ROOT / "backend/app/api/router.py"
    api_tree = ast.parse(api_file.read_text())
    imports = {}
    for node in api_tree.body:
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app."):
            for alias in node.names:
                imports[alias.asname or alias.name] = (node.module, alias.name)
    included = []
    for node in api_tree.body:
        call = node.value if isinstance(node, ast.Expr) else None
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "include_router":
            assert isinstance(call.args[0], ast.Name), "Review dynamic router inclusion"
            included.append(imports[call.args[0].id])
    legacy = []
    for module, router in included:
        path = ROOT / "backend" / (module.replace(".", "/") + ".py")
        tree = ast.parse(path.read_text())
        declaration = next(node.value for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == router for target in node.targets))
        assert isinstance(declaration, ast.Call) and isinstance(declaration.func, ast.Name) and declaration.func.id == "APIRouter"
        prefix = next((ast.literal_eval(keyword.value) for keyword in declaration.keywords if keyword.arg == "prefix"), "")
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                    continue
                call = decorator.func
                if not isinstance(call.value, ast.Name) or call.value.id != router or call.attr not in METHODS:
                    continue
                route = normalize("/api/v1" + prefix + ast.literal_eval(decorator.args[0]))
                legacy.append({"method": call.attr.upper(), "path": route, "source": str(path.relative_to(ROOT)), "class": "system" if route in SYSTEM else "business"})
    node_file = ROOT / "backend-node/src/api/compat/routes/compat.js"
    declarations = re.findall(r'\["(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)",\s*"([^"]+)",\s*"[^"]+"\]', node_file.read_text())
    assert declarations, "Review Node route manifest syntax"
    node_routes = {(method, normalize("/api/v1" + path)) for method, path in declarations}
    assert len(node_routes) == len(declarations), "Duplicate Node declarations"
    legacy_keys = {(row["method"], row["path"]) for row in legacy}
    assert len(legacy_keys) == len(legacy), "Duplicate legacy declarations"
    for row in legacy:
        row["presence"] = "present" if (row["method"], row["path"]) in node_routes else "absent"
    legacy.sort(key=lambda row: (row["path"], row["method"]))
    overlap = legacy_keys & node_routes
    absent = legacy_keys - node_routes
    return {
        "basis": "Explicit application METHOD/path declarations at the shipped /api/v1 prefix, with parameter names normalized. Excludes generated framework routes, frontend and native CMS.",
        "claim_limit": "Presence is not parity, migrated production data, workflow completion or production readiness. See node-legacy-read-compatibility.md for known differences and acceptance limits.",
        "counts": {
            "legacy": len(legacy), "legacy_business": sum(row["class"] == "business" for row in legacy),
            "legacy_system": sum(row["class"] == "system" for row in legacy),
            "node_compat": len(node_routes), "overlap": len(overlap),
            "overlap_business": sum(path not in SYSTEM for _, path in overlap),
            "overlap_system": sum(path in SYSTEM for _, path in overlap),
            "absent": len(absent), "absent_business": sum(path not in SYSTEM for _, path in absent),
            "absent_system": sum(path in SYSTEM for _, path in absent), "node_only": len(node_routes - legacy_keys),
        },
        "legacy": legacy,
        "node_only": [{"method": method, "path": path, "source": str(node_file.relative_to(ROOT))} for method, path in sorted(node_routes - legacy_keys)],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate the declaration inventory after reviewing changes")
    args = parser.parse_args()
    expected = json.dumps(build(), indent=2, ensure_ascii=False) + "\n"
    if args.write:
        TARGET.write_text(expected)
    elif TARGET.read_text() != expected:
        raise SystemExit("Route inventory drift: review declarations and regenerate explicitly with --write")
    print(json.dumps(json.loads(expected)["counts"]))
