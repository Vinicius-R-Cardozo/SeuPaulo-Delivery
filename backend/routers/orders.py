"""Pedidos: criação, listagem por papel, status, atribuição e rastreamento."""
from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, save, new_id, now_iso, order_code, RESTAURANT
from deps import get_current_user
from geo import eta_minutes, build_route, point_along_route
from schemas import CreateOrderInput, StatusUpdate, AssignDriverInput, LocationInput, DeliveryCodeInput
import random

router = APIRouter(prefix="/orders", tags=["orders"])

# Duração da entrega simulada (para o marcador andar no mapa durante a demo).
_SIM_DURATION_S = 90

_STATUS_LABELS = {
    "confirmed": "Seu pedido foi confirmado! 🍻",
    "preparing": "A cozinha já está no fogo 👨‍🍳",
    "ready": "Pedido pronto! Já já sai pra entrega 📦",
    "on_the_way": "Seu pedido está a caminho 🛵",
    "arrived": "O entregador chegou. Informe o código de entrega. 🔔",
    "cancelled": "Seu pedido foi cancelado.",
}


def _notify(user_id: str, audience: str, title: str, body: str, order_id: str | None = None):
    db()["notifications"].insert(0, {
        "id": new_id("n"), "userId": user_id, "audience": audience,
        "title": title, "body": body, "orderId": order_id,
        "read": False, "createdAt": now_iso(),
    })


def _apply_sim(order: dict) -> dict:
    """Deriva a posição do entregador pelo tempo decorrido (rastreamento ao vivo).

    Sem threads: a cada leitura calculamos onde o entregador está com base em
    quando o pedido saiu para entrega. Persistimos para o histórico ficar coerente.
    """
    if order.get("status") != "on_the_way" or not order.get("address"):
        return order
    started = order.get("_simStarted")
    if not started:
        return order
    elapsed = time.time() - started
    progress = max(0.0, min(1.0, elapsed / _SIM_DURATION_S))
    route = build_route(RESTAURANT, {"lat": order["address"]["lat"], "lng": order["address"]["lng"]})
    total_eta = eta_minutes({"lat": order["address"]["lat"], "lng": order["address"]["lng"]}, False)
    order["driverLocation"] = point_along_route(route, progress)
    order["etaMinutes"] = max(1, round(total_eta * (1 - progress)))
    order["updatedAt"] = now_iso()
    d = next((x for x in db()["drivers"] if x["id"] == order.get("driverId")), None)
    if d:
        d["location"] = order["driverLocation"]
    return order


def _visible(order: dict) -> dict:
    """Remove campos internos (prefixo _) antes de responder."""
    return {k: v for k, v in order.items() if not k.startswith("_")}


def _can_see(order: dict, user: dict) -> bool:
    if user["role"] == "admin":
        return True
    if user["role"] == "customer":
        return order["customerId"] == user["id"]
    if user["role"] == "driver":
        return order.get("driverId") == user["id"] or (
            order.get("driverId") is None and order["status"] == "ready"
            and order["fulfillment"] == "delivery"
        )
    return False


@router.post("")
def create_order(body: CreateOrderInput, user: dict = Depends(get_current_user)):
    if user["role"] != "customer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Apenas clientes criam pedidos.")
    data = db()
    iso = now_iso()
    payment_status = "pending" if body.paymentMethod == "cash" else "approved"
    eta = eta_minutes({"lat": body.address["lat"], "lng": body.address["lng"]}) if body.address else 25
    order = {
        "id": new_id("o"), "code": order_code(), "customerId": user["id"],
        "customerName": user["fullName"], "customerPhone": user.get("phone", ""),
        "items": body.items, "fulfillment": body.fulfillment, "address": body.address,
        "subtotal": body.subtotal, "deliveryFee": body.deliveryFee, "discount": body.discount,
        "total": body.total, "couponCode": body.couponCode, "paymentMethod": body.paymentMethod,
        "paymentStatus": payment_status, "changeFor": body.changeFor, "status": "received",
        "statusHistory": [{"status": "received", "at": iso}],
        "driverId": None, "driverLocation": None, "etaMinutes": eta,
        "deliveredAt": None,
        # Código de entrega: prefixo "_" garante que _visible() NUNCA o exponha
        # nas respostas de pedido (o motorista não vê). Só sai pelo endpoint próprio.
        "_deliveryCode": f"{random.randint(0, 999999):06d}",
        "_codeUsed": False,
        "createdAt": iso, "updatedAt": iso,
    }
    data["orders"].insert(0, order)
    if body.couponCode:
        c = next((x for x in data["coupons"] if x["code"] == body.couponCode), None)
        if c:
            c["usedCount"] += 1
    _notify("u-admin", "admin", "Novo pedido recebido",
            f"{order['code']} — {order['customerName']} • R$ {order['total']:.2f}", order["id"])
    _notify(order["customerId"], "customer", f"Pedido {order['code']}",
            "Pedido recebido! Estamos preparando tudo. 🟡", order["id"])
    save()
    return _visible(order)


@router.get("")
def list_orders(user: dict = Depends(get_current_user)):
    out = []
    for o in db()["orders"]:
        if _can_see(o, user):
            out.append(_visible(_apply_sim(o)))
    save()
    return out


@router.get("/available")
def available(user: dict = Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Apenas entregadores.")
    return [
        _visible(o) for o in db()["orders"]
        if o["fulfillment"] == "delivery" and o.get("driverId") is None and o["status"] == "ready"
    ]


@router.get("/{order_id}")
def get_order(order_id: str, user: dict = Depends(get_current_user)):
    o = next((x for x in db()["orders"] if x["id"] == order_id), None)
    if not o or not _can_see(o, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    _apply_sim(o)
    save()
    return _visible(o)


@router.patch("/{order_id}/status")
def update_status(order_id: str, body: StatusUpdate, user: dict = Depends(get_current_user)):
    data = db()
    o = next((x for x in data["orders"] if x["id"] == order_id), None)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    if user["role"] == "customer" and o["customerId"] != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    if user["role"] == "driver" and o.get("driverId") != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    # Segurança: "entregue" só pela confirmação de código (endpoint próprio).
    if body.status == "delivered":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A entrega só pode ser confirmada com o código do cliente.")

    o["status"] = body.status
    o["updatedAt"] = now_iso()
    o["statusHistory"].append({"status": body.status, "at": o["updatedAt"], "note": body.note})
    if body.status == "on_the_way":
        o["_simStarted"] = time.time()
    if body.status == "cancelled":
        o.pop("_simStarted", None)

    label = _STATUS_LABELS.get(body.status)
    if label:
        _notify(o["customerId"], "customer", f"Pedido {o['code']}", label, o["id"])
    save()
    return _visible(o)


@router.get("/{order_id}/delivery-code")
def get_delivery_code(order_id: str, user: dict = Depends(get_current_user)):
    o = next((x for x in db()["orders"] if x["id"] == order_id), None)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    # Só o dono (cliente) ou admin podem ver o código — o motorista NUNCA.
    if user["role"] != "admin" and o["customerId"] != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    return {"code": o.get("_deliveryCode")}


@router.post("/{order_id}/confirm-delivery")
def confirm_delivery(order_id: str, body: DeliveryCodeInput, user: dict = Depends(get_current_user)):
    data = db()
    o = next((x for x in data["orders"] if x["id"] == order_id), None)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    # Validação 100% no backend: motorista atribuído + código + status.
    if o.get("driverId") is None or o.get("driverId") != user["id"]:
        return {"ok": False, "error": "Você não é o entregador deste pedido."}
    if o["status"] == "delivered":
        return {"ok": False, "error": "Pedido já foi entregue."}
    if o["status"] not in ("on_the_way", "arrived"):
        return {"ok": False, "error": "O pedido ainda não está em entrega."}
    if o.get("_codeUsed"):
        return {"ok": False, "error": "Código indisponível."}
    informado = "".join(ch for ch in (body.code or "") if ch.isdigit())
    if o.get("_deliveryCode") != informado:
        return {"ok": False, "error": "Código de entrega inválido."}

    now = now_iso()
    o["status"] = "delivered"
    o["deliveredAt"] = now
    o["paymentStatus"] = "approved"
    o["etaMinutes"] = 0
    o["_codeUsed"] = True
    o.pop("_simStarted", None)
    o["statusHistory"].append({"status": "delivered", "at": now})
    if o.get("address"):
        o["driverLocation"] = {"lat": o["address"]["lat"], "lng": o["address"]["lng"]}
    d = next((x for x in data["drivers"] if x["id"] == o.get("driverId")), None)
    if d:
        d["totalDeliveries"] += 1
    _notify(o["customerId"], "customer", f"Pedido {o['code']}", "Pedido entregue com sucesso ✅", o["id"])
    save()
    return {"ok": True}


@router.post("/{order_id}/assign")
def assign_driver(order_id: str, body: AssignDriverInput, user: dict = Depends(get_current_user)):
    data = db()
    o = next((x for x in data["orders"] if x["id"] == order_id), None)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    # Admin atribui qualquer um; entregador só pode reivindicar para si.
    if user["role"] == "driver" and body.driverId != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    if user["role"] == "customer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    o["driverId"] = body.driverId
    o["updatedAt"] = now_iso()
    _notify(body.driverId, "driver", "Pedido atribuído a você",
            f"{o['code']} — retire no Seu Paulo Buteco.", o["id"])
    save()
    return _visible(o)


@router.post("/{order_id}/cancel")
def cancel_order(order_id: str, user: dict = Depends(get_current_user)):
    return update_status(order_id, StatusUpdate(status="cancelled", note="Cancelado"), user)


@router.post("/{order_id}/driver-location")
def driver_location(order_id: str, body: LocationInput, user: dict = Depends(get_current_user)):
    data = db()
    o = next((x for x in data["orders"] if x["id"] == order_id), None)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    o["driverLocation"] = {"lat": body.lat, "lng": body.lng}
    o["updatedAt"] = now_iso()
    save()
    return {"ok": True}
