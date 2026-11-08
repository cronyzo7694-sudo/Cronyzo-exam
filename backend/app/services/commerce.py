"""Commerce engine — pricing, commission, tax and fulfilment rules.

Cronyzo sells three different kinds of thing (courses, books, physical
products) through one checkout. This module centralises the money maths so
the routes never hard-code a percentage and the admin panel can later move
commission to the Platform Config Engine without touching business logic.

Public contract (stable)::

    DEFAULT_COMMISSION_PERCENT
    FREE_SHIPPING_THRESHOLD
    compute_cart_totals(items, ...) -> dict
    seller_earnings(gross, percent) -> dict

All functions are pure and never raise on bad input — a malformed item is
skipped rather than blowing up a checkout.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

# Platform cut taken from every seller sale (percent)
DEFAULT_COMMISSION_PERCENT = 12.0

# Orders above this subtotal ship free (INR)
FREE_SHIPPING_THRESHOLD = 999.0

# Flat shipping fee below the free-shipping threshold (INR)
FLAT_SHIPPING_FEE = 49.0

# Digital goods (ebooks, course access) never incur shipping
DEFAULT_TAX_PERCENT = 0.0


def _money(value: Any) -> float:
    try:
        return round(float(value or 0.0), 2)
    except (TypeError, ValueError):
        return 0.0


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def compute_cart_totals(
    items: Iterable[Dict[str, Any]],
    *,
    shipping_fee: Optional[float] = None,
    tax_percent: float = DEFAULT_TAX_PERCENT,
    discount: float = 0.0,
    has_physical_items: bool = True,
) -> Dict[str, Any]:
    """
    Compute checkout totals for a basket of line items.

    Parameters
    ----------
    items:
        Iterable of dicts with ``unit_price`` and ``qty`` keys. Anything
        without a usable price is skipped.
    shipping_fee:
        Override the computed shipping fee. ``None`` means "derive it".
    tax_percent:
        Tax applied on the discounted subtotal.
    discount:
        Flat discount already approved (coupon, wallet).
    has_physical_items:
        When ``False`` (pure digital basket) shipping is always zero.

    Returns
    -------
    dict
        ``subtotal``, ``shipping_fee``, ``tax``, ``discount``, ``total``,
        ``item_count`` and ``total_qty``.
    """
    subtotal = 0.0
    total_qty = 0
    item_count = 0

    for raw in items or []:
        if not isinstance(raw, dict):
            continue
        try:
            qty = max(1, int(raw.get("qty", 1)))
        except (TypeError, ValueError):
            qty = 1
        unit = _money(raw.get("unit_price"))
        if unit <= 0:
            continue
        subtotal += unit * qty
        total_qty += qty
        item_count += 1

    subtotal = _money(subtotal)
    discount = _clamp(_money(discount), 0.0, subtotal)

    if shipping_fee is None:
        if not has_physical_items:
            shipping_fee = 0.0
        elif subtotal <= 0:
            shipping_fee = 0.0
        elif subtotal >= FREE_SHIPPING_THRESHOLD:
            shipping_fee = 0.0
        else:
            shipping_fee = FLAT_SHIPPING_FEE
    else:
        shipping_fee = _clamp(_money(shipping_fee), 0.0, 100000.0)

    taxable = _money(subtotal - discount)
    tax = _money(taxable * (_clamp(_money(tax_percent), 0.0, 100.0) / 100.0))
    total = _money(taxable + shipping_fee + tax)

    return {
        "subtotal": subtotal,
        "shipping_fee": _money(shipping_fee),
        "tax": tax,
        "discount": discount,
        "total": total,
        "item_count": item_count,
        "total_qty": total_qty,
        "free_shipping_threshold": FREE_SHIPPING_THRESHOLD,
        "free_shipping_gap": _money(max(0.0, FREE_SHIPPING_THRESHOLD - taxable)),
    }


def seller_earnings(gross: float, commission_percent: float = DEFAULT_COMMISSION_PERCENT) -> Dict[str, Any]:
    """
    Split a gross sale into platform commission and seller payout.

    ``commission_percent`` is clamped to ``0..100`` so a bad config can never
    produce a negative payout.
    """
    gross = _money(gross)
    percent = _clamp(_money(commission_percent), 0.0, 100.0)
    commission = _money(gross * (percent / 100.0))
    payout = _money(gross - commission)
    return {
        "gross": gross,
        "commission_percent": percent,
        "commission": commission,
        "payout": payout,
    }


def apply_coupon(total: float, coupon: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Apply a coupon descriptor to a cart total.

    ``coupon`` is a plain dict with ``type`` (``percent`` | ``flat``),
    ``value`` and optionally ``max_discount``. Returns the discounted total
    plus the discount amount. A malformed coupon is ignored (no crash).
    """
    total = _money(total)
    if not isinstance(coupon, dict):
        return {"total": total, "discount": 0.0, "coupon": None}

    try:
        value = _money(coupon.get("value"))
    except Exception:  # noqa: BLE001
        value = 0.0
    if value <= 0:
        return {"total": total, "discount": 0.0, "coupon": None}

    kind = str(coupon.get("type") or "percent").lower()
    if kind == "flat":
        discount = _money(value)
    else:
        discount = _money(total * (value / 100.0))

    max_discount = coupon.get("max_discount")
    if max_discount not in (None, ""):
        cap = _money(max_discount)
        if cap > 0:
            discount = _money(min(discount, cap))

    discount = _clamp(discount, 0.0, total)
    return {
        "total": _money(total - discount),
        "discount": discount,
        "coupon": coupon,
    }


def shipping_for(items: List[Dict[str, Any]]) -> float:
    """Convenience wrapper returning just the shipping fee for a basket."""
    has_physical = any(
        str(item.get("item_type") or item.get("fulfillment") or "physical") == "physical"
        for item in items
        if isinstance(item, dict)
    )
    totals = compute_cart_totals(items, has_physical_items=has_physical)
    return float(totals["shipping_fee"])


__all__ = [
    "DEFAULT_COMMISSION_PERCENT",
    "FREE_SHIPPING_THRESHOLD",
    "FLAT_SHIPPING_FEE",
    "compute_cart_totals",
    "seller_earnings",
    "apply_coupon",
    "shipping_for",
]
