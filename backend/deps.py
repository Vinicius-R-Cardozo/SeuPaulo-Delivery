"""Dependências de autenticação/autorização (guardas por papel)."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from database import db
from security import decode_token


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado.")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida ou expirada.")
    user = next((u for u in db()["users"] if u["id"] == payload["sub"]), None)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Conta não encontrada.")
    return user


def require_role(*roles: str):
    def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado para este perfil.")
        return user
    return _dep
