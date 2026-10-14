import io
import pytest
from datetime import date
from decimal import Decimal

from app.normalizers import (
    normalize_gstin,
    normalize_invoice_date,
    normalize_invoice_number,
    normalize_monetary_value,
)
from app.parsers import parse_csv_content, parse_xlsx_content
from conftest import make_csv_bytes, make_xlsx_bytes


def test_alternative_supported_column_headers():
    alt_headers = [
        "GSTIN",
        "Invoice No",
        "Bill Date",
        "Taxable Amount",
        "Central Tax",
        "State Tax Amount",
        "Integrated Tax",
    ]
    rows = [
        ["27AABCT3421M1Z2", "INV/01", "2026-09-10", "1000.00", "90.00", "90.00", "0.00"]
    ]
    csv_bytes = make_csv_bytes(alt_headers, rows)
    records, errors = parse_csv_content(csv_bytes, "Purchase Register")
    assert len(errors) == 0
    assert len(records) == 1
    assert records[0]["supplier_gstin"] == "27AABCT3421M1Z2"
    assert records[0]["invoice_number"] == "INV/01"


def test_missing_required_columns():
    incomplete_headers = [
        "Supplier GSTIN",
        "Invoice Number",
        "Invoice Date",
        # missing taxable_value, cgst, sgst, igst
    ]
    rows = [["27AABCT3421M1Z2", "INV-100", "2026-09-01"]]
    csv_bytes = make_csv_bytes(incomplete_headers, rows)
    records, errors = parse_csv_content(csv_bytes, "Purchase Register")
    assert len(records) == 0
    assert len(errors) > 0
    assert any("Missing required column" in err.reason for err in errors)


def test_ambiguous_column_headers():
    ambiguous_headers = [
        "Supplier GSTIN",
        "Invoice No",
        "Invoice Number",  # Two headers map to invoice_number!
        "Invoice Date",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
    ]
    rows = [["27AABCT3421M1Z2", "INV-1", "INV-1", "2026-09-01", "100", "9", "9", "0"]]
    csv_bytes = make_csv_bytes(ambiguous_headers, rows)
    records, errors = parse_csv_content(csv_bytes, "Purchase Register")
    assert len(records) == 0
    assert any("Ambiguous column mapping" in err.reason for err in errors)


def test_blank_rows_handling():
    headers = [
        "Supplier GSTIN",
        "Invoice Number",
        "Invoice Date",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
    ]
    rows = [
        ["27AABCT3421M1Z2", "INV-001", "2026-09-01", "1000", "90", "90", "0"],
        ["", "", "", "", "", "", ""],  # Blank row
        [None, None, None, None, None, None, None],  # None row
        ["27AABCT3421M1Z2", "INV-002", "2026-09-02", "2000", "180", "180", "0"],
    ]
    csv_bytes = make_csv_bytes(headers, rows)
    records, errors = parse_csv_content(csv_bytes, "Purchase Register")
    assert len(errors) == 0
    # Blank rows should be ignored, leaving exactly 2 records
    assert len(records) == 2
    assert records[0]["invoice_number"] == "INV-001"
    assert records[1]["invoice_number"] == "INV-002"


def test_whitespace_and_case_normalization():
    # Whitespace around GSTIN and lower case
    raw_gstin = "  27aabct3421m1z2  "
    norm_gstin = normalize_gstin(raw_gstin)
    assert norm_gstin == "27AABCT3421M1Z2"

    # Whitespace around invoice number
    raw_inv = "   INV-0042/26   "
    norm_inv = normalize_invoice_number(raw_inv)
    assert norm_inv == "INV-0042/26"


def test_preservation_of_leading_zeros_and_special_chars():
    # Verify leading zeros, hyphens, and slashes are NOT stripped
    inv1 = "00123"
    assert normalize_invoice_number(inv1) == "00123"

    inv2 = "INV/2026-27/0045"
    assert normalize_invoice_number(inv2) == "INV/2026-27/0045"

    inv3 = "00098-B"
    assert normalize_invoice_number(inv3) == "00098-B"


def test_date_parsing_and_normalization():
    expected = date(2026, 9, 4)

    # Different valid representations
    assert normalize_invoice_date("2026-09-04") == expected
    assert normalize_invoice_date("04/09/2026") == expected
    assert normalize_invoice_date("04-09-2026") == expected
    assert normalize_invoice_date("2026/09/04") == expected
    assert normalize_invoice_date("04.09.2026") == expected

    # Invalid dates
    with pytest.raises(ValueError):
        normalize_invoice_date("2026-02-30")  # Invalid day in Feb

    with pytest.raises(ValueError):
        normalize_invoice_date("invalid-date-string")

    with pytest.raises(ValueError):
        normalize_invoice_date("")


def test_monetary_values_safe_decimal_parsing():
    # Standard decimal
    assert normalize_monetary_value("1234.56") == Decimal("1234.56")

    # Values with currency symbols, commas, spaces
    assert normalize_monetary_value("₹ 1,50,000.50") == Decimal("150000.50")
    assert normalize_monetary_value("Rs. 45,000") == Decimal("45000.00")
    assert normalize_monetary_value("INR 9,999.99") == Decimal("9999.99")

    # Non-numeric values must be rejected, not converted to 0
    with pytest.raises(ValueError):
        normalize_monetary_value("N/A")

    with pytest.raises(ValueError):
        normalize_monetary_value("free")

    with pytest.raises(ValueError):
        normalize_monetary_value("")


def test_duplicate_invoice_rows_preserved():
    headers = [
        "Supplier GSTIN",
        "Invoice Number",
        "Invoice Date",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
    ]
    # Same invoice row repeated twice in file
    rows = [
        ["27AABCT3421M1Z2", "INV-100", "2026-09-01", "1000", "90", "90", "0"],
        ["27AABCT3421M1Z2", "INV-100", "2026-09-01", "1000", "90", "90", "0"],
    ]
    csv_bytes = make_csv_bytes(headers, rows)
    records, errors = parse_csv_content(csv_bytes, "Purchase Register")
    assert len(errors) == 0
    assert len(records) == 2
    assert records[0]["invoice_number"] == "INV-100"
    assert records[1]["invoice_number"] == "INV-100"


def test_structured_error_reporting():
    headers = [
        "Supplier GSTIN",
        "Invoice Number",
        "Invoice Date",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
    ]
    rows = [
        # Row 2: valid
        ["27AABCT3421M1Z2", "INV-01", "2026-09-01", "1000", "90", "90", "0"],
        # Row 3: invalid GSTIN and invalid taxable value
        ["INVALID_GSTIN", "INV-02", "2026-09-02", "NOT_A_NUMBER", "90", "90", "0"],
    ]
    csv_bytes = make_csv_bytes(headers, rows)
    records, errors = parse_csv_content(csv_bytes, "Purchase Register")
    assert len(errors) == 2
    assert errors[0].row == 3
    assert errors[0].field == "supplier_gstin"
    assert errors[1].row == 3
    assert errors[1].field == "taxable_value"
