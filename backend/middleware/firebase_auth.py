"""
Firebase authentication + multi-tenant workspace resolution.

NexusLLM is multi-tenant: every signed-in Google account (a Firebase ``uid``)
gets its own isolated workspace of provider keys, custom providers and a unique
unified key. This module turns an incoming request into a *workspace id*.

How a request is authenticated
------------------------------
* ``Authorization: Bearer <firebase-id-token>`` — verified against Google's
  public certificates (RS256). The workspace id is the token's ``uid``.
* ``Authorization: Bearer <admin-api-key>`` — the operator/admin. Maps to the
  reserved ``"default"`` workspace (where env-seeded keys live), preserving the
  original single-admin behaviour.

Firebase ID tokens are verified locally (signature + issuer + audience + expiry)
using Google's published x509 certs, so no Firebase Admin SDK / service account
is required — only the project id (``FIREBASE_PROJECT_ID``).
"""

from __future__ import annotations

import logging
import time

import httpx
from fastapi import HTTPException, Request, status

logger = logging.getLogger("nexusllm.auth.firebase")

DEFAULT_WORKSPACE = "default"

# Google's public x509 certs for Firebase ID tokens (keyed by `kid`).
_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)

# In-process cert cache: {kid: pem}, refreshed per Cache-Control max-age.
_certs: dict[str, str] = {}
_certs_expiry: float = 0.0


def _extract_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


async def _get_certs() -> dict[str, str]:
    """Return Google's Firebase signing certs, cached until they expire."""
    global _certs, _certs_expiry
    now = time.time()
    if _certs and now < _certs_expiry:
        return _certs
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_CERTS_URL)
        resp.raise_for_status()
        _certs = resp.json()
        # Respect the max-age so we refresh roughly when Google rotates keys.
        max_age = 3600
        cc = resp.headers.get("cache-control", "")
        for part in cc.split(","):
            part = part.strip()
            if part.startswith("max-age="):
                try:
                    max_age = int(part.split("=", 1)[1])
                except ValueError:
                    pass
        _certs_expiry = now + max_age
    return _certs


async def verify_firebase_token(token: str, project_id: str) -> dict | None:
    """Verify a Firebase ID token. Returns its decoded claims, or None.

    Validates signature (RS256 against Google's certs), issuer, audience and
    expiry. Returns ``None`` for any malformed/invalid token so callers can
    fall through to other auth schemes.
    """
    if not token or not project_id:
        return None
    try:
        import jwt
    except Exception:  # pragma: no cover - dependency missing.
        logger.warning("PyJWT not installed; Firebase auth disabled.")
        return None

    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        return None
    kid = header.get("kid")
    if not kid:
        return None

    try:
        certs = await _get_certs()
    except Exception as exc:  # pragma: no cover - network failure.
        logger.warning("could not fetch Firebase certs: %s", exc)
        return None

    cert_pem = certs.get(kid)
    if not cert_pem:
        # Unknown key id — force a refresh once in case of rotation.
        global _certs_expiry
        _certs_expiry = 0.0
        try:
            certs = await _get_certs()
        except Exception:
            return None
        cert_pem = certs.get(kid)
        if not cert_pem:
            return None

    issuer = f"https://securetoken.google.com/{project_id}"
    try:
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend

        cert_obj = x509.load_pem_x509_certificate(
            cert_pem.encode(), default_backend()
        )
        pub = cert_obj.public_key()
        claims = jwt.decode(
            token,
            pub,
            algorithms=["RS256"],
            audience=project_id,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub"]},
        )
    except Exception as exc:
        logger.info("Firebase token rejected: %s", exc)
        return None

    if not claims.get("sub"):
        return None
    return claims


async def resolve_workspace(request: Request) -> str | None:
    """Resolve the workspace id for an admin-scoped request, or None.

    Order: admin key -> ``default``; valid Firebase token -> its uid.
    """
    config = request.app.state.config
    token = _extract_bearer(request)
    if not token:
        return None

    admin_key = config.app.admin_api_key
    if admin_key and token == admin_key:
        return DEFAULT_WORKSPACE

    project_id = getattr(config.app, "firebase_project_id", "") or ""
    claims = await verify_firebase_token(token, project_id)
    if claims:
        return str(claims["sub"])
    return None


async def require_workspace(request: Request) -> str:
    """FastAPI dependency: return the caller's workspace id or raise 401.

    Used by per-user endpoints (keys, custom providers, unified key) so each
    account only ever sees and edits its own data.
    """
    wid = await resolve_workspace(request)
    if wid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in (Google) or provide a valid admin key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return wid


async def require_identity(request: Request) -> str:
    """FastAPI dependency for global admin endpoints (metrics, analytics,
    providers): accept either the admin key or a valid Firebase token. Returns
    the workspace id (mostly informational for these global views)."""
    return await require_workspace(request)


async def resolve_proxy_workspace(request: Request) -> str:
    """Resolve the workspace for a /v1 proxy request from its bearer token.

    * A per-user unified key (``nexus-…``) -> that user's workspace.
    * A valid Firebase ID token -> that user's workspace (lets the in-app
      playground call /v1 with the same Google login it uses for /admin).
    * The admin key -> ``default``.
    * The configured global proxy key (or no proxy key set) -> ``default``.
    * A wrong key when a proxy key IS configured -> 401.
    """
    config = request.app.state.config
    keystore = request.app.state.keystore
    token = _extract_bearer(request)

    if token:
        wid = await keystore.user_for_unified_key(token)
        if wid:
            return wid

        admin_key = config.app.admin_api_key
        if admin_key and token == admin_key:
            return DEFAULT_WORKSPACE

        project_id = getattr(config.app, "firebase_project_id", "") or ""
        if project_id:
            claims = await verify_firebase_token(token, project_id)
            if claims:
                return str(claims["sub"])

    expected = config.app.proxy_api_key
    if not expected:
        # Proxy auth disabled: open access maps to the default workspace.
        return DEFAULT_WORKSPACE
    if token == expected:
        return DEFAULT_WORKSPACE

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API key.",
        headers={"WWW-Authenticate": "Bearer"},
    )
