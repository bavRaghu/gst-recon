import csv
import io
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from openpyxl import load_workbook

from .normalizers import (
    normalize_gstin,
    normalize_invoice_date,
    normalize_invoice_number,
    normalize_monetary_value,
)
from .schemas import ValidationErrorItem

CANONICAL_FIELDS = [
    "supplier_gstin",
    "invoice_number",
    "invoice_date",
    "taxable_value",
    "cgst",
    "sgst",
    "igst",
]

# Mapping from canonical field to acceptable header aliases (lowercased, stripped)
HEADER_SYNONYMS: Dict[str, Set[str]] = {
    "supplier_gstin": {
        "gstin",
        "supplier gstin",
        "supplier_gstin",
        "suppliergstin",
        "gstin of supplier",
        "gstin/uin of supplier",
        "gstin/uin",
        "ctin",
        "vendor gstin",
    },
    "invoice_number": {
        "invoice no",
        "invoice number",
        "invoice_no",
        "invoice_number",
        "invoiceno",
        "invoice #",
        "inv no",
        "inv number",
        "inv_no",
        "document no",
        "doc no",
        "bill no",
    },
    "invoice_date": {
        "invoice date",
        "invoice_date",
        "invoicedate",
        "inv date",
        "inv_date",
        "bill date",
        "doc date",
        "date",
    },
    "taxable_value": {
        "taxable value",
        "taxable_value",
        "taxable amount",
        "taxable val",
        "taxable",
        "assessable value",
        "taxable amt",
        "taxable_amt",
    },
    "cgst": {
        "cgst",
        "cgst amount",
        "cgst_amount",
        "central tax",
        "central tax amount",
        "cgst amt",
        "central gst",
    },
    "sgst": {
        "sgst",
        "sgst amount",
        "sgst_amount",
        "state tax",
        "state tax amount",
        "sgst amt",
        "state gst",
        "utgst",
        "utgst amount",
    },
    "igst": {
        "igst",
        "igst amount",
        "igst_amount",
        "integrated tax",
        "integrated tax amount",
        "igst amt",
        "integrated gst",
    },
}


def _clean_header_name(header: Any) -> str:
    """Normalize column header string for alias matching."""
    if header is None:
        return ""
    s = str(header).strip().lower()
    # Replace multiple spaces/underscores with single space
    s = re.sub(r"[\s_]+", " ", s)
    return s


def build_column_mapping(
    raw_headers: List[Any], 
    file_type: str
) -> Tuple[Optional[Dict[str, int]], List[ValidationErrorItem]]:
    """
    Maps list of raw headers to canonical field names by index.
    Detects missing columns and ambiguous duplicate mappings.
    """
    errors: List[ValidationErrorItem] = []
    canonical_to_indices: Dict[str, List[Tuple[str, int]]] = {f: [] for f in CANONICAL_FIELDS}

    for idx, raw in enumerate(raw_headers):
        cleaned = _clean_header_name(raw)
        if not cleaned:
            continue
        
        # Check against each canonical field synonym set
        for canonical, synonyms in HEADER_SYNONYMS.items():
            if cleaned in synonyms or cleaned.replace(" ", "_") in synonyms:
                canonical_to_indices[canonical].append((str(raw), idx))

    # Check for ambiguous mappings (multiple columns mapped to same canonical field)
    mapping: Dict[str, int] = {}
    for canonical, found in canonical_to_indices.items():
        if len(found) > 1:
            col_names = [f"'{col[0]}'" for col in found]
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=1,
                    field=canonical,
                    reason=(
                        f"Ambiguous column mapping: multiple columns ({', '.join(col_names)}) "
                        f"map to canonical field '{canonical}'."
                    ),
                )
            )
        elif len(found) == 1:
            mapping[canonical] = found[0][1]

    # Check for missing required columns
    missing = [f for f in CANONICAL_FIELDS if f not in mapping]
    if missing:
        errors.append(
            ValidationErrorItem(
                file_type=file_type,
                row=1,
                field=missing[0] if len(missing) == 1 else None,
                reason=f"Missing required column(s): {', '.join(missing)}.",
            )
        )

    if errors:
        return None, errors

    return mapping, []


def parse_and_normalize_rows(
    rows: List[List[Any]],
    mapping: Dict[str, int],
    file_type: str,
    start_row_number: int = 2,
) -> Tuple[List[Dict[str, Any]], List[ValidationErrorItem]]:
    """
    Iterates over tabular rows, applies normalization, and collects all errors.
    Skips purely blank rows.
    """
    normalized_records: List[Dict[str, Any]] = []
    errors: List[ValidationErrorItem] = []

    for row_idx, row in enumerate(rows, start=start_row_number):
        # Check if entire row is blank
        if not row or all(
            cell is None or str(cell).strip() == "" for cell in row
        ):
            continue

        record_data: Dict[str, Any] = {}
        row_has_error = False

        # 1. Supplier GSTIN
        col_idx = mapping["supplier_gstin"]
        raw_val = row[col_idx] if col_idx < len(row) else None
        try:
            record_data["supplier_gstin"] = normalize_gstin(raw_val)
        except ValueError as ex:
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=row_idx,
                    field="supplier_gstin",
                    reason=str(ex),
                )
            )
            row_has_error = True

        # 2. Invoice Number
        col_idx = mapping["invoice_number"]
        raw_val = row[col_idx] if col_idx < len(row) else None
        try:
            record_data["invoice_number"] = normalize_invoice_number(raw_val)
        except ValueError as ex:
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=row_idx,
                    field="invoice_number",
                    reason=str(ex),
                )
            )
            row_has_error = True

        # 3. Invoice Date
        col_idx = mapping["invoice_date"]
        raw_val = row[col_idx] if col_idx < len(row) else None
        try:
            record_data["invoice_date"] = normalize_invoice_date(raw_val)
        except ValueError as ex:
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=row_idx,
                    field="invoice_date",
                    reason=str(ex),
                )
            )
            row_has_error = True

        # 4. Taxable Value
        col_idx = mapping["taxable_value"]
        raw_val = row[col_idx] if col_idx < len(row) else None
        try:
            record_data["taxable_value"] = normalize_monetary_value(raw_val, "Taxable value")
        except ValueError as ex:
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=row_idx,
                    field="taxable_value",
                    reason=str(ex),
                )
            )
            row_has_error = True

        # 5. CGST
        col_idx = mapping["cgst"]
        raw_val = row[col_idx] if col_idx < len(row) else None
        try:
            record_data["cgst"] = normalize_monetary_value(raw_val, "CGST")
        except ValueError as ex:
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=row_idx,
                    field="cgst",
                    reason=str(ex),
                )
            )
            row_has_error = True

        # 6. SGST
        col_idx = mapping["sgst"]
        raw_val = row[col_idx] if col_idx < len(row) else None
        try:
            record_data["sgst"] = normalize_monetary_value(raw_val, "SGST")
        except ValueError as ex:
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=row_idx,
                    field="sgst",
                    reason=str(ex),
                )
            )
            row_has_error = True

        # 7. IGST
        col_idx = mapping["igst"]
        raw_val = row[col_idx] if col_idx < len(row) else None
        try:
            record_data["igst"] = normalize_monetary_value(raw_val, "IGST")
        except ValueError as ex:
            errors.append(
                ValidationErrorItem(
                    file_type=file_type,
                    row=row_idx,
                    field="igst",
                    reason=str(ex),
                )
            )
            row_has_error = True

        if not row_has_error:
            normalized_records.append(record_data)

    return normalized_records, errors


def parse_csv_content(
    file_bytes: bytes, 
    file_type: str
) -> Tuple[List[Dict[str, Any]], List[ValidationErrorItem]]:
    """Parses a CSV file buffer, detects encoding, and normalizes rows."""
    if not file_bytes:
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason="File is empty (0 bytes).",
            )
        ]

    # Try utf-8-sig (handles UTF-8 with BOM), then utf-8, then latin-1
    text: Optional[str] = None
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if text is None:
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason="File encoding is unreadable. Expected UTF-8 encoded CSV.",
            )
        ]

    # Check for binary null bytes
    if "\x00" in text:
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason="File appears to be a corrupt or binary file, not a valid CSV.",
            )
        ]

    f = io.StringIO(text)
    reader = csv.reader(f)
    
    try:
        raw_headers = next(reader)
    except StopIteration:
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason="CSV file contains no header row or data.",
            )
        ]

    mapping, col_errors = build_column_mapping(raw_headers, file_type)
    if col_errors:
        return [], col_errors

    assert mapping is not None

    rows = list(reader)
    return parse_and_normalize_rows(rows, mapping, file_type, start_row_number=2)


def parse_xlsx_content(
    file_bytes: bytes, 
    file_type: str
) -> Tuple[List[Dict[str, Any]], List[ValidationErrorItem]]:
    """Parses an Excel (.xlsx) file buffer using openpyxl."""
    if not file_bytes:
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason="File is empty (0 bytes).",
            )
        ]

    # Validate ZIP / XLSX magic bytes (PK\x03\x04)
    if not file_bytes.startswith(b"PK\x03\x04"):
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason="File is not a valid Excel (.xlsx) workbook.",
            )
        ]

    try:
        wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    except Exception as ex:
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason=f"Failed to read Excel workbook: {str(ex)}",
            )
        ]

    try:
        sheet = wb.active
        if sheet is None:
            return [], [
                ValidationErrorItem(
                    file_type=file_type,
                    row=None,
                    field=None,
                    reason="Excel workbook contains no active worksheet.",
                )
            ]

        row_iter = sheet.iter_rows(values_only=True)
        try:
            raw_headers = next(row_iter)
        except StopIteration:
            return [], [
                ValidationErrorItem(
                    file_type=file_type,
                    row=None,
                    field=None,
                    reason="Excel file contains no header row or data.",
                )
            ]

        mapping, col_errors = build_column_mapping(list(raw_headers), file_type)
        if col_errors:
            return [], col_errors

        assert mapping is not None

        rows = [list(r) for r in row_iter]
        return parse_and_normalize_rows(rows, mapping, file_type, start_row_number=2)
    finally:
        wb.close()


def parse_file(
    filename: str, 
    file_bytes: bytes, 
    file_type: str
) -> Tuple[List[Dict[str, Any]], List[ValidationErrorItem]]:
    """
    Main entry point for parsing either CSV or XLSX content.
    Determines parser from extension and magic header.
    """
    lower_name = filename.lower()
    if lower_name.endswith(".csv"):
        return parse_csv_content(file_bytes, file_type)
    elif lower_name.endswith(".xlsx"):
        return parse_xlsx_content(file_bytes, file_type)
    else:
        return [], [
            ValidationErrorItem(
                file_type=file_type,
                row=None,
                field=None,
                reason=f"Unsupported file format '{filename}'. Only .csv and .xlsx are supported.",
            )
        ]
