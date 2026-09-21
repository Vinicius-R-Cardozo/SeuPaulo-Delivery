"""Entregadores: listagem, aprovação, disponibilidade e localização."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, save, now_iso, new_id
from deps import get_current_user, require_role
from schemas import DriverStatusInput, OnlineInput, LocationInput

router = APIRouter(prefix="/drivers", tags=["drivers"])

_STATUS_MSG = {
    "approved": "Cadastro aprovado! Você já pode receber entregas. 🟢",
    "rejected": "Seu cadastro foi reprovado.",
    "blocked": "Seu acesso foi bloqueado.",
    "pending": "Seu cadastro voltou para análise.",
}


def _find(driver_id: str) -> dict | None:
    return next((d for d in db()["drivers"] if d["id"] == driver_id), None)


@router.get("")
def list_drivers(_admin=Depends(require_role("admin"))):
    return db()["drivers"]


@router.get("/{driver_id}")
def get_driver(driver_id: str, user: dict = Depends(get_current_user)):
    d = _find(driver_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entregador não encontrado.")
    return d


@router.patch("/{driver_id}/status")
def set_status(driver_id: str, body: DriverStatusInput, _admin=Depends(require_role("admin"))):
    d = _find(driver_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entregador não encontrado.")
    d["status"] = body.status
    db()["notifications"].insert(0, {
        "id": new_id("n"), "userId": driver_id, "audience": "driver",
        "title": "Status do cadastro atualizado", "body": _STATUS_MSG.get(body.status, ""),
        "read": False, "createdAt": now_iso(),
    })
    save()
    return d


@router.post("/{driver_id}/online")
def set_online(driver_id: str, body: OnlineInput, user: dict = Depends(get_current_user)):
    if user["role"] != "admin" and user["id"] != driver_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    d = _find(driver_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entregador não encontrado.")
    d["online"] = body.online
    save()
    return d


@router.post("/{driver_id}/location")
def set_location(driver_id: str, body: LocationInput, user: dict = Depends(get_current_user)):
    if user["role"] != "admin" and user["id"] != driver_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    d = _find(driver_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entregador não encontrado.")
    d["location"] = {"lat": body.lat, "lng": body.lng}
    save()
    return d
