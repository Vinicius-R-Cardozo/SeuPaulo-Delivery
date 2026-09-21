"""Geometria de rota/ETA — espelha src/utils/geo.ts do frontend."""
from __future__ import annotations

import math

from database import RESTAURANT

_PREP_MIN = 25


def haversine_km(a: dict, b: dict) -> float:
    R = 6371.0
    d_lat = math.radians(b["lat"] - a["lat"])
    d_lng = math.radians(b["lng"] - a["lng"])
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    h = math.sin(d_lat / 2) ** 2 + math.sin(d_lng / 2) ** 2 * math.cos(lat1) * math.cos(lat2)
    return R * 2 * math.asin(math.sqrt(h))


def eta_minutes(destination: dict, include_prep: bool = True) -> int:
    km = haversine_km(RESTAURANT, destination)
    travel = (km / 22) * 60
    prep = _PREP_MIN if include_prep else 0
    return max(5, round(prep + travel))


def _quad(p0: float, p1: float, p2: float, t: float) -> float:
    mt = 1 - t
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2


def build_route(a: dict, b: dict, steps: int = 40) -> list[dict]:
    mx = (a["lat"] + b["lat"]) / 2 + (b["lng"] - a["lng"]) * 0.08
    my = (a["lng"] + b["lng"]) / 2 - (b["lat"] - a["lat"]) * 0.08
    pts = []
    for i in range(steps + 1):
        t = i / steps
        pts.append({"lat": _quad(a["lat"], mx, b["lat"], t), "lng": _quad(a["lng"], my, b["lng"], t)})
    return pts


def point_along_route(route: list[dict], progress: float) -> dict:
    if not route:
        return dict(RESTAURANT)
    clamped = max(0.0, min(1.0, progress))
    idx = clamped * (len(route) - 1)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return route[lo]
    frac = idx - lo
    return {
        "lat": route[lo]["lat"] + (route[hi]["lat"] - route[lo]["lat"]) * frac,
        "lng": route[lo]["lng"] + (route[hi]["lng"] - route[lo]["lng"]) * frac,
    }
