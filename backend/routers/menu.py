"""Cardápio: categorias e produtos (CRUD do admin)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, save, new_id
from deps import require_role
from schemas import ProductInput, AvailabilityInput

router = APIRouter(tags=["menu"])


@router.get("/categories")
def categories():
    return db()["categories"]


@router.get("/products")
def products():
    return db()["products"]


@router.get("/products/{product_id}")
def get_product(product_id: str):
    p = next((x for x in db()["products"] if x["id"] == product_id), None)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
    return p


@router.put("/products")
def upsert_product(body: ProductInput, _admin=Depends(require_role("admin"))):
    data = db()
    product = body.model_dump()
    if not product.get("id"):
        product["id"] = new_id("p")
    idx = next((i for i, x in enumerate(data["products"]) if x["id"] == product["id"]), -1)
    if idx >= 0:
        data["products"][idx] = product
    else:
        data["products"].insert(0, product)
    save()
    return product


@router.delete("/products/{product_id}")
def delete_product(product_id: str, _admin=Depends(require_role("admin"))):
    data = db()
    data["products"] = [x for x in data["products"] if x["id"] != product_id]
    save()
    return {"ok": True}


@router.patch("/products/{product_id}/availability")
def set_availability(product_id: str, body: AvailabilityInput, _admin=Depends(require_role("admin"))):
    p = next((x for x in db()["products"] if x["id"] == product_id), None)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
    p["available"] = body.available
    save()
    return p
