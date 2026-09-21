"""Hashing de senha (PBKDF2) e tokens de sessão assinados (HMAC) — só stdlib.

Sem dependências nativas: instala e roda em qualquer Windows/Linux com Python 3.
Em produção troque o SPD_SECRET e considere um gateway de identidade dedicado.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

SECRET = os.environ.get("SPD_SECRET", "dev-secret-troque-em-producao").encode()
_PBKDF2_ROUNDS = 120_000
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 dias


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2${_PBKDF2_ROUNDS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(user_id: str, role: str) -> str:
    payload = {"sub": user_id, "role": role, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64e(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def decode_token(token: str) -> dict | None:
    try:
        body, sig = token.split(".")
        expected = _b64e(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64d(body))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None
