"""Endereços do cliente."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, save, new_id, now_iso
from deps import get_current_user
from schemas import AddressInput

router = APIRouter(prefix="/addresses", tags=["addresses"])


@router.get("")
def list_addresses(user: dict = Depends(get_current_user)):
    return [a for a in db()["addresses"] if a["userId"] == user["id"]]


@router.put("")
def save_address(body: AddressInput, user: dict = Depends(get_current_user)):
    data = db()
    addr = body.model_dump()
    addr["userId"] = user["id"]
    if not addr.get("id"):
        addr["id"] = new_id("a")
        addr["createdAt"] = now_iso()
    if addr["isDefault"]:
        for a in data["addresses"]:
            if a["userId"] == user["id"]:
                a["isDefault"] = False
    idx = next((i for i, a in enumerate(data["addresses"]) if a["id"] == addr["id"]), -1)
    if idx >= 0:
        addr.setdefault("createdAt", data["addresses"][idx].get("createdAt", now_iso()))
        data["addresses"][idx] = addr
    else:
        addr.setdefault("createdAt", now_iso())
        data["addresses"].append(addr)
    save()
    return addr


@router.delete("/{address_id}")
def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    data = db()
    data["addresses"] = [
        a for a in data["addresses"] if not (a["id"] == address_id and a["userId"] == user["id"])
    ]
    save()
    return {"ok": True}


@router.post("/{address_id}/default")
def set_default(address_id: str, user: dict = Depends(get_current_user)):
    for a in db()["addresses"]:
        if a["userId"] == user["id"]:
            a["isDefault"] = a["id"] == address_id
    save()
    return {"ok": True}
