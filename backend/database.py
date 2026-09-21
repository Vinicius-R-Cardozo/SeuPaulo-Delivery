"""Persistência simples em arquivo JSON + seed inicial.

É o "banco" do backend de demonstração — portátil e sem dependências. Em
produção troque por Postgres/Supabase mantendo a mesma forma dos dados.
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from security import hash_password

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"
SEED_MENU = BASE_DIR / "seed_menu.json"

_lock = threading.RLock()
_db: dict | None = None

RESTAURANT = {"lat": -19.9503895, "lng": -44.2166209}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _days_ago(d: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=d)).isoformat()


def new_id(prefix: str = "") -> str:
    raw = uuid.uuid4().hex
    return f"{prefix}_{raw}" if prefix else raw


def order_code() -> str:
    import random
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "#" + "".join(random.choice(chars) for _ in range(4))


def _load_menu() -> tuple[list, list]:
    data = json.loads(SEED_MENU.read_text(encoding="utf-8"))
    # normaliza camelCase -> forma usada pela API (mantém como veio do front)
    return data["categories"], data["products"]


def _seed() -> dict:
    categories, products = _load_menu()

    users = [
        {"id": "u-admin", "role": "admin", "fullName": "Paulo Administrador",
         "email": "admin@seupaulo.com", "phone": "(31) 7352-9146", "createdAt": _days_ago(120)},
        {"id": "u-cliente", "role": "customer", "fullName": "Maria Cliente",
         "email": "cliente@seupaulo.com", "phone": "(31) 98888-1234", "createdAt": _days_ago(30)},
        {"id": "u-entregador", "role": "driver", "fullName": "João Entregador",
         "email": "entregador@seupaulo.com", "phone": "(31) 97777-5678", "createdAt": _days_ago(20)},
        {"id": "u-entregador2", "role": "driver", "fullName": "Carlos Novato",
         "email": "entregador2@seupaulo.com", "phone": "(31) 96666-4321", "createdAt": _days_ago(2)},
    ]
    credentials = {u["email"]: hash_password("Senha123") for u in users}

    drivers = [
        {"id": "u-entregador", "vehicleType": "moto", "plate": "PWA1B23", "model": "Honda CG 160",
         "color": "Vermelha", "status": "approved", "online": True,
         "location": {"lat": RESTAURANT["lat"] + 0.004, "lng": RESTAURANT["lng"] - 0.003},
         "rating": 4.9, "totalDeliveries": 342, "createdAt": _days_ago(20)},
        {"id": "u-entregador2", "vehicleType": "moto", "plate": "QXR4C56", "model": "Yamaha Factor 150",
         "color": "Preta", "status": "pending", "online": False, "location": None,
         "rating": 0, "totalDeliveries": 0, "createdAt": _days_ago(2)},
    ]

    home = {"id": "a-casa", "userId": "u-cliente", "label": "casa", "street": "R. das Acácias",
            "number": "245", "complement": "Apto 102", "reference": "Portão azul, ao lado da padaria",
            "neighborhood": "Angola", "city": "Betim", "state": "MG", "zip": "32653-100",
            "lat": RESTAURANT["lat"] + 0.012, "lng": RESTAURANT["lng"] + 0.009,
            "isDefault": True, "createdAt": _days_ago(30)}
    work = {"id": "a-trabalho", "userId": "u-cliente", "label": "trabalho",
            "street": "Av. Governador Valadares", "number": "1200", "complement": "Sala 3",
            "neighborhood": "Centro", "city": "Betim", "state": "MG", "zip": "32600-000",
            "lat": RESTAURANT["lat"] - 0.02, "lng": RESTAURANT["lng"] + 0.016,
            "isDefault": False, "createdAt": _days_ago(15)}

    coupons = [
        {"code": "BEMVINDO10", "description": "10% de desconto no primeiro pedido", "type": "percent",
         "value": 10, "minSubtotal": 30, "maxUses": 1000, "usedCount": 0,
         "expiresAt": _days_ago(-90), "active": True},
        {"code": "SEUPAULO", "description": "R$ 15 off em pedidos acima de R$ 80", "type": "fixed",
         "value": 15, "minSubtotal": 80, "maxUses": 500, "usedCount": 0,
         "expiresAt": _days_ago(-60), "active": True},
        {"code": "PROMOCAO", "description": "20% off na semana do boteco", "type": "percent",
         "value": 20, "minSubtotal": 50, "maxUses": 200, "usedCount": 0,
         "expiresAt": _days_ago(-30), "active": True},
    ]

    frango = next((p for p in products if p["id"] == "p-frango"), None)
    brahma = next((p for p in products if p["id"] == "p-brahma"), None)
    past_order = {
        "id": "o-hist-1", "code": "#K7P2", "customerId": "u-cliente", "customerName": "Maria Cliente",
        "customerPhone": "(31) 98888-1234",
        "items": [
            {"id": "ci-1", "product": frango, "quantity": 1,
             "addons": [{"groupId": "g-tam-porcao", "groupName": "Tamanho", "optionId": "t-inteira",
                         "optionName": "Porção inteira", "price": 18}], "unitPrice": 62.9},
            {"id": "ci-2", "product": brahma, "quantity": 3, "addons": [], "unitPrice": 12.9},
        ],
        "fulfillment": "delivery", "address": home, "subtotal": 101.6, "deliveryFee": 6.9,
        "discount": 0, "total": 108.5, "paymentMethod": "pix", "paymentStatus": "approved",
        "status": "delivered",
        "statusHistory": [{"status": s, "at": _days_ago(7)} for s in
                          ["received", "confirmed", "preparing", "ready", "on_the_way", "delivered"]],
        "driverId": "u-entregador", "driverLocation": None, "etaMinutes": None,
        "createdAt": _days_ago(7), "updatedAt": _days_ago(7),
    }

    return {
        "users": users,
        "credentials": credentials,
        "categories": categories,
        "products": products,
        "addresses": [home, work],
        "coupons": coupons,
        "orders": [past_order],
        "drivers": drivers,
        "notifications": [],
    }


def load() -> dict:
    global _db
    with _lock:
        if _db is not None:
            return _db
        if DATA_FILE.exists():
            try:
                _db = json.loads(DATA_FILE.read_text(encoding="utf-8"))
                return _db
            except Exception:
                pass
        _db = _seed()
        _persist()
        return _db


def _persist() -> None:
    if _db is None:
        return
    DATA_FILE.write_text(json.dumps(_db, ensure_ascii=False, indent=2), encoding="utf-8")


def save() -> None:
    with _lock:
        _persist()


def reset() -> None:
    """Reseta ao estado inicial (útil em demonstração)."""
    global _db
    with _lock:
        _db = _seed()
        _persist()


def db() -> dict:
    return load()
