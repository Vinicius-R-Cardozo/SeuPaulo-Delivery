"""Cupons de desconto."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, status

from database import db
from schemas import CouponCheck

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.get("")
def list_coupons():
    return db()["coupons"]


@router.post("/validate")
def validate(body: CouponCheck):
    coupon = next(
        (c for c in db()["coupons"] if c["code"].upper() == body.code.strip().upper()), None
    )
    if not coupon:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cupom não encontrado.")
    if not coupon["active"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cupom inativo.")
    try:
        expires = datetime.fromisoformat(coupon["expiresAt"])
        if expires.timestamp() < datetime.now(expires.tzinfo).timestamp():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cupom expirado.")
    except (ValueError, TypeError):
        pass
    if coupon["usedCount"] >= coupon["maxUses"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cupom esgotado.")
    if body.subtotal < coupon["minSubtotal"]:
        minimo = f"{coupon['minSubtotal']:.2f}".replace(".", ",")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Pedido mínimo de R$ {minimo} para este cupom.")
    return coupon
