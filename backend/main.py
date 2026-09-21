"""Seu Paulo Delivery — API (FastAPI + uvicorn).

Backend de demonstração com o mesmo domínio do app (cliente, entregador, admin).
Rode: uvicorn main:app --reload --port 8000  (ou: python main.py)
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import db, reset
from routers import auth, menu, addresses, coupons, orders, drivers, notifications

app = FastAPI(title="Seu Paulo Delivery API", version="1.0.0")

# CORS liberado: o app (web/Android via ngrok) precisa acessar de outras origens.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(menu.router)
app.include_router(addresses.router)
app.include_router(coupons.router)
app.include_router(orders.router)
app.include_router(drivers.router)
app.include_router(notifications.router)


@app.on_event("startup")
def _startup():
    db()  # carrega/semeia o banco na subida


@app.get("/")
def health():
    return {"service": "Seu Paulo Delivery API", "status": "ok"}


@app.post("/dev/reset")
def dev_reset():
    """Reseta o banco de demonstração ao estado inicial."""
    reset()
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=False)
