"""Autenticação: login, cadastro, recuperação e perfil."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from database import db, save, new_id, now_iso
from deps import get_current_user
from security import hash_password, verify_password, create_token
from schemas import (
    SignInInput, SignUpInput, ProfilePatch, PasswordChange, PasswordReset, EmailOnly,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _find_user_by_email(email: str) -> dict | None:
    key = email.strip().lower()
    return next((u for u in db()["users"] if u["email"].lower() == key), None)


@router.post("/signin")
def signin(body: SignInInput):
    data = db()
    user = _find_user_by_email(body.email)
    stored = data["credentials"].get(user["email"]) if user else None
    if not user or not stored or not verify_password(body.password, stored):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos.")
    if body.role and user["role"] != body.role:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta conta não tem acesso a este ambiente.")
    return {"token": create_token(user["id"], user["role"]), "profile": user}


@router.post("/signup")
def signup(body: SignUpInput):
    data = db()
    if _find_user_by_email(body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe uma conta com este e-mail.")
    user = {
        "id": new_id("u"), "role": body.role, "fullName": body.fullName.strip(),
        "email": body.email.strip(), "phone": body.phone.strip(), "createdAt": now_iso(),
    }
    data["users"].append(user)
    data["credentials"][user["email"]] = hash_password(body.password)
    if body.role == "driver" and body.driver:
        data["drivers"].append({
            "id": user["id"], "vehicleType": body.driver.vehicleType,
            "plate": body.driver.plate.upper(), "model": body.driver.model, "color": body.driver.color,
            "status": "pending", "online": False, "location": None,
            "rating": 0, "totalDeliveries": 0, "createdAt": user["createdAt"],
        })
        data["notifications"].insert(0, {
            "id": new_id("n"), "userId": "u-admin", "audience": "admin",
            "title": "Novo entregador cadastrado", "body": f"{user['fullName']} aguarda aprovação.",
            "read": False, "createdAt": now_iso(),
        })
    save()
    return {"token": create_token(user["id"], user["role"]), "profile": user}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"profile": user}


@router.post("/reset-request")
def reset_request(body: EmailOnly):
    if not _find_user_by_email(body.email):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Não encontramos uma conta com este e-mail.")
    # Em produção, aqui dispararíamos o e-mail com o link de redefinição.
    return {"ok": True}


@router.post("/reset")
def reset(body: PasswordReset):
    data = db()
    user = _find_user_by_email(body.email)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada.")
    data["credentials"][user["email"]] = hash_password(body.newPassword)
    save()
    return {"ok": True}


@router.patch("/profile")
def update_profile(body: ProfilePatch, user: dict = Depends(get_current_user)):
    if body.fullName is not None:
        user["fullName"] = body.fullName.strip()
    if body.phone is not None:
        user["phone"] = body.phone.strip()
    if body.avatarUrl is not None:
        user["avatarUrl"] = body.avatarUrl
    save()
    return user


@router.post("/change-password")
def change_password(body: PasswordChange, user: dict = Depends(get_current_user)):
    data = db()
    if not verify_password(body.current, data["credentials"].get(user["email"], "")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Senha atual incorreta.")
    data["credentials"][user["email"]] = hash_password(body.next)
    save()
    return {"ok": True}


@router.get("/customers")
def list_customers(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado.")
    return [u for u in db()["users"] if u["role"] == "customer"]


@router.get("/users/{user_id}")
def get_user(user_id: str, user: dict = Depends(get_current_user)):
    target = next((u for u in db()["users"] if u["id"] == user_id), None)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada.")
    return target
