import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Union

# Standard Indian GSTIN Regex:
# 2 digits state code + 5 letters + 4 digits + 1 letter + 1 entity char + 'Z' + 1 checksum char
GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")


def normalize_gstin(val: Any) -> str:
    """
    Normalizes and validates a Supplier GSTIN.
    - Strips leading and trailing whitespace.
    - Normalizes letter casing to uppercase.
    - Validates 15-character GSTIN format.
    - Does not alter underlying value.
    """
    if val is None:
        raise ValueError("Supplier GSTIN is required and cannot be blank.")
    
    s = str(val).strip().upper()
    if not s:
        raise ValueError("Supplier GSTIN is required and cannot be blank.")
    
    if len(s) != 15:
        raise ValueError(
            f"Invalid GSTIN length: '{s}' has {len(s)} characters (expected exactly 15 characters)."
        )

    if not GSTIN_REGEX.match(s):
        raise ValueError(
            f"Invalid GSTIN format: '{s}' does not match standard 15-character GSTIN structure."
        )

    return s


def normalize_invoice_number(val: Any) -> str:
    """
    Conservative normalization of an invoice number.
    - Strips whitespace.
    - Normalizes letter casing to uppercase.
    - Preserves meaningful characters including leading zeros, hyphens, and slashes.
    - Rejects empty values.
    """
    if val is None:
        raise ValueError("Invoice number is required and cannot be blank.")
    
    s = str(val).strip().upper()
    if not s:
        raise ValueError("Invoice number is required and cannot be blank.")
    
    return s


def normalize_invoice_date(val: Any) -> date:
    """
    Normalizes invoice date into a consistent date object (YYYY-MM-DD).
    Supports:
    - date or datetime instances
    - Strings: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, DD.MM.YYYY
    Rejects invalid, missing, or ambiguous dates.
    """
    if val is None:
        raise ValueError("Invoice date is required and cannot be blank.")

    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val

    s = str(val).strip()
    if not s:
        raise ValueError("Invoice date is required and cannot be blank.")

    # Try explicit supported date formats (Indian accounting standard uses DD/MM/YYYY or YYYY-MM-DD)
    date_formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
    ]

    for fmt in date_formats:
        try:
            parsed = datetime.strptime(s, fmt).date()
            return parsed
        except ValueError:
            continue

    raise ValueError(
        f"Invalid or unsupported date format: '{s}'. Expected YYYY-MM-DD or DD/MM/YYYY."
    )


def normalize_monetary_value(val: Any, field_name: str = "Amount") -> Decimal:
    """
    Parses numeric monetary values safely using Decimal.
    - Strips currency symbols (₹, Rs., Rs, INR) and commas.
    - Rejects non-numeric, blank, or invalid values.
    - Quantizes to 2 decimal places.
    - Does NOT silently convert empty or invalid strings to zero.
    """
    if val is None:
        raise ValueError(f"{field_name} is required and cannot be blank.")

    if isinstance(val, (int, float)):
        # Convert float via str to prevent binary float inaccuracies
        s = str(val).strip()
    else:
        s = str(val).strip()

    if not s:
        raise ValueError(f"{field_name} is required and cannot be blank.")

    # Strip currency notations, commas, and whitespace
    cleaned = re.sub(r"[₹\$,]|Rs\.?|INR", "", s, flags=re.IGNORECASE).strip()

    try:
        dec = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        raise ValueError(f"Invalid numeric value '{s}' for {field_name}.")

    if dec.is_nan() or dec.is_infinite():
        raise ValueError(f"Invalid monetary amount '{s}' for {field_name}.")

    return dec.quantize(Decimal("0.01"))
