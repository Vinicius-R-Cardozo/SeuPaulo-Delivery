"""Notificações do usuário."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from database import db, save
from deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: dict = Depends(get_current_user)):
    return [n for n in db()["notifications"] if n["userId"] == user["id"]]


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    for n in db()["notifications"]:
        if n["id"] == notification_id and n["userId"] == user["id"]:
            n["read"] = True
    save()
    return {"ok": True}
