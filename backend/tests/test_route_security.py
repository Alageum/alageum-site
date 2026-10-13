from fastapi.routing import APIRoute

from app.main import app

PUBLIC_PATH_PREFIXES = (
    "/api/v1/health",
    "/api/v1/readiness",
    "/api/v1/metrics",
    "/api/v1/version",
    "/api/v1/catalog",
    "/api/v1/content",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/invitations/{token}/accept",
    "/api/v1/auth/password/reset",
)
TENANT_PREFIXES = (
    "/api/v1/orders",
    "/api/v1/documents",
    "/api/v1/files",
    "/api/v1/finance",
    "/api/v1/quotes",
    "/api/v1/support",
    "/api/v1/integrations",
    "/api/v1/ai",
    "/api/v1/admin",
)


def dependency_calls(route: APIRoute):
    pending = list(route.dependant.dependencies)
    while pending:
        dependency = pending.pop()
        if dependency.call:
            yield dependency.call
        pending.extend(dependency.dependencies)


def test_every_private_route_declares_authentication_and_tenant_scope():
    failures = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith("/api/v1"):
            continue
        if route.path.startswith(PUBLIC_PATH_PREFIXES):
            continue
        calls = list(dependency_calls(route))
        if not any(getattr(call, "authentication_required", False) for call in calls):
            failures.append(f"{route.path}: missing authentication")
        if route.path.startswith(TENANT_PREFIXES) and not any(
            getattr(call, "tenant_required", False) for call in calls
        ):
            failures.append(f"{route.path}: missing tenant scope")
    assert failures == []


def test_protected_domain_routes_declare_permission_dependency():
    failures = []
    permission_prefixes = TENANT_PREFIXES[:-2] + ("/api/v1/admin",)
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith(permission_prefixes):
            continue
        if not any(getattr(call, "required_permission", None) for call in dependency_calls(route)):
            failures.append(route.path)
    assert failures == []
