"""Modelos de entrada (Pydantic) do backend Seu Paulo Delivery."""
from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, EmailStr


class SignInInput(BaseModel):
    email: str
    password: str
    role: Optional[Literal["customer", "driver", "admin"]] = None


class DriverInfo(BaseModel):
    vehicleType: Literal["moto", "carro", "bicicleta"]
    plate: str
    model: str
    color: str


class SignUpInput(BaseModel):
    fullName: str
    email: str
    phone: str
    password: str
    role: Literal["customer", "driver", "admin"] = "customer"
    driver: Optional[DriverInfo] = None


class ProfilePatch(BaseModel):
    fullName: Optional[str] = None
    phone: Optional[str] = None
    avatarUrl: Optional[str] = None


class PasswordChange(BaseModel):
    current: str
    next: str


class PasswordReset(BaseModel):
    email: str
    newPassword: str


class EmailOnly(BaseModel):
    email: str


class AddressInput(BaseModel):
    id: Optional[str] = None
    label: Literal["casa", "trabalho", "outro"] = "casa"
    street: str
    number: str
    complement: Optional[str] = None
    reference: Optional[str] = None
    neighborhood: str = ""
    city: str = ""
    state: str = ""
    zip: Optional[str] = None
    lat: float
    lng: float
    isDefault: bool = False


class CouponCheck(BaseModel):
    code: str
    subtotal: float


class CreateOrderInput(BaseModel):
    items: list[dict[str, Any]]
    fulfillment: Literal["delivery", "pickup"]
    address: Optional[dict[str, Any]] = None
    subtotal: float
    deliveryFee: float
    discount: float
    total: float
    couponCode: Optional[str] = None
    paymentMethod: Literal["pix", "card", "cash"]
    changeFor: Optional[float] = None


class StatusUpdate(BaseModel):
    status: Literal[
        "received", "confirmed", "preparing", "ready", "on_the_way", "delivered", "cancelled"
    ]
    note: Optional[str] = None


class AssignDriverInput(BaseModel):
    driverId: str


class LocationInput(BaseModel):
    lat: float
    lng: float


class DriverStatusInput(BaseModel):
    status: Literal["pending", "approved", "rejected", "blocked"]


class OnlineInput(BaseModel):
    online: bool


class ProductInput(BaseModel):
    id: Optional[str] = None
    categorySlug: str
    name: str
    description: str = ""
    price: float
    image: str = ""
    available: bool = True
    serves: Optional[str] = None
    tags: list[str] = []
    popular: bool = False
    isNew: bool = False
    addonGroups: list[dict[str, Any]] = []


class AvailabilityInput(BaseModel):
    available: bool
