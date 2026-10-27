import logging
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from .. import config

logger = logging.getLogger(__name__)

SEVERITY_MAJOR = "MAJOR"
SEVERITY_MINOR = "MINOR"
SEVERITY_NONE = "NONE"
SEVERITY_REVIEW_REQUIRED = "REVIEW_REQUIRED"
SEVERITY_UNCLASSIFIED = "UNCLASSIFIED"

VALID_SEVERITIES = {
    SEVERITY_MAJOR,
    SEVERITY_MINOR,
    SEVERITY_NONE,
    SEVERITY_REVIEW_REQUIRED,
    SEVERITY_UNCLASSIFIED,
}


@dataclass
class FieldDiscrepancy:
    field_name: str
    purchase_value: Decimal
    gstr2b_value: Decimal
    difference: Decimal
    absolute_difference: Decimal
    relative_difference: Optional[Decimal]
    percentage: Optional[Decimal]
    severity: str
    reason: str


@dataclass
class DiscrepancyClassification:
    severity: str  # 'MAJOR', 'MINOR', 'NONE', 'UNCLASSIFIED'
    reason: str
    rule_applied: str
    field_discrepancies: List[FieldDiscrepancy] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)


class DiscrepancyClassificationService:
    """
    Centralized, deterministic classification engine for invoice discrepancy severity.
    Implements project-defined materiality thresholds (₹1,000 absolute and 1.0% relative).
    """

    @classmethod
    def classify(
        cls,
        status: str,
        pr: Optional[Any] = None,
        twob: Optional[Any] = None,
        differences: Optional[Dict[str, dict]] = None,
        tolerance: Optional[Decimal] = None,
        abs_threshold: Optional[Decimal] = None,
        pct_threshold: Optional[Decimal] = None,
    ) -> DiscrepancyClassification:
        """
        Authoritative classification method.
        Evaluates record status, compared monetary fields, and dates deterministically.
        """
        if tolerance is None:
            tolerance = config.DEFAULT_RECONCILIATION_TOLERANCE
        if abs_threshold is None:
            abs_threshold = config.MATERIALITY_ABSOLUTE_THRESHOLD
        if pct_threshold is None:
            pct_threshold = config.MATERIALITY_PERCENTAGE_THRESHOLD

        differences = differences or {}

        # 1. Exact / Tolerated Matches
        if status == "MATCHED":
            return DiscrepancyClassification(
                severity=SEVERITY_NONE,
                reason=f"Record matches within tolerance (INR {tolerance:.2f}). No discrepancy.",
                rule_applied="TOLERANCE_MATCH_NONE",
                details={"matching_tolerance": f"{tolerance:.2f}"},
            )

        # 2. Duplicate / Ambiguous Records
        if status == "DUPLICATE_AMBIGUOUS":
            return DiscrepancyClassification(
                severity=SEVERITY_UNCLASSIFIED,
                reason="Duplicate invoice records detected with identical identifier; ambiguous match requires manual resolution.",
                rule_applied="AMBIGUOUS_DUPLICATE_HOLD",
                details={"status": status},
            )

        # 3. Invoices Missing in Portal (GSTR-2B)
        if status == "MISSING_IN_GSTR2B":
            pr_taxable = cls._to_decimal(getattr(pr, "taxable_value", 0)) if pr else Decimal("0.00")
            pr_tax = (
                cls._to_decimal(getattr(pr, "cgst", 0))
                + cls._to_decimal(getattr(pr, "sgst", 0))
                + cls._to_decimal(getattr(pr, "igst", 0))
            ) if pr else Decimal("0.00")
            pr_total = pr_taxable + pr_tax

            return DiscrepancyClassification(
                severity=SEVERITY_MAJOR,
                reason=(
                    f"Invoice present in Purchase Register (Total: INR {pr_total:.2f}, Tax: INR {pr_tax:.2f}) "
                    f"but missing from GSTR-2B; major statutory ITC risk under Section 16(2)(aa)."
                ),
                rule_applied="MISSING_IN_PORTAL_MAJOR",
                details={
                    "missing_source": "gstr2b",
                    "total_invoice_value": f"{pr_total:.2f}",
                    "tax_at_risk": f"{pr_tax:.2f}",
                },
            )

        # 4. Invoices Missing in Books (Purchase Register)
        if status == "MISSING_IN_PURCHASE_REGISTER":
            twob_taxable = cls._to_decimal(getattr(twob, "taxable_value", 0)) if twob else Decimal("0.00")
            twob_tax = (
                cls._to_decimal(getattr(twob, "cgst", 0))
                + cls._to_decimal(getattr(twob, "sgst", 0))
                + cls._to_decimal(getattr(twob, "igst", 0))
            ) if twob else Decimal("0.00")
            twob_total = twob_taxable + twob_tax

            return DiscrepancyClassification(
                severity=SEVERITY_MAJOR,
                reason=(
                    f"Invoice declared in GSTR-2B by supplier (Total: INR {twob_total:.2f}, Tax: INR {twob_tax:.2f}) "
                    f"but missing from internal Purchase Register; unrecorded purchase credit."
                ),
                rule_applied="MISSING_IN_BOOKS_MAJOR",
                details={
                    "missing_source": "purchase_register",
                    "total_invoice_value": f"{twob_total:.2f}",
                    "unclaimed_itc": f"{twob_tax:.2f}",
                },
            )

        # 5. Insufficient Data Check
        if pr is None and twob is None:
            return DiscrepancyClassification(
                severity=SEVERITY_UNCLASSIFIED,
                reason="Insufficient record data for reliable classification.",
                rule_applied="INSUFFICIENT_DATA_UNCLASSIFIED",
                details={},
            )

        # 6. Financial Mismatches (status == "MISMATCH")
        # Compare taxable_value, cgst, sgst, igst, and total_invoice_value
        field_evaluations: List[FieldDiscrepancy] = []

        monetary_fields = ["taxable_value", "cgst", "sgst", "igst"]
        for field_name in monetary_fields:
            pr_val = cls._to_decimal(getattr(pr, field_name, 0)) if pr else Decimal("0.00")
            twob_val = cls._to_decimal(getattr(twob, field_name, 0)) if twob else Decimal("0.00")
            
            f_disc = cls._evaluate_monetary_field(
                field_name=field_name,
                pr_val=pr_val,
                twob_val=twob_val,
                tolerance=tolerance,
                abs_threshold=abs_threshold,
                pct_threshold=pct_threshold,
            )
            field_evaluations.append(f_disc)

        # Total Invoice Value Comparison
        pr_total = (
            cls._to_decimal(getattr(pr, "taxable_value", 0))
            + cls._to_decimal(getattr(pr, "cgst", 0))
            + cls._to_decimal(getattr(pr, "sgst", 0))
            + cls._to_decimal(getattr(pr, "igst", 0))
        ) if pr else Decimal("0.00")

        twob_total = (
            cls._to_decimal(getattr(twob, "taxable_value", 0))
            + cls._to_decimal(getattr(twob, "cgst", 0))
            + cls._to_decimal(getattr(twob, "sgst", 0))
            + cls._to_decimal(getattr(twob, "igst", 0))
        ) if twob else Decimal("0.00")

        total_disc = cls._evaluate_monetary_field(
            field_name="total_invoice_value",
            pr_val=pr_total,
            twob_val=twob_total,
            tolerance=tolerance,
            abs_threshold=abs_threshold,
            pct_threshold=pct_threshold,
        )
        field_evaluations.append(total_disc)

        # Date Discrepancy Check (if applicable)
        date_discrepancy = False
        date_reason = None
        date_tolerance = getattr(config, "DISCREPANCY_DATE_TOLERANCE_DAYS", 30)
        date_exceeds_tolerance = False
        if pr and twob and hasattr(pr, "invoice_date") and hasattr(twob, "invoice_date"):
            if pr.invoice_date and twob.invoice_date and pr.invoice_date != twob.invoice_date:
                days = abs((pr.invoice_date - twob.invoice_date).days)
                date_discrepancy = True
                date_exceeds_tolerance = days > date_tolerance
                if date_exceeds_tolerance:
                    date_reason = f"Invoice date differs by {days} day(s), exceeding configured {date_tolerance}-day threshold (PR: {pr.invoice_date}, 2B: {twob.invoice_date})"
                else:
                    date_reason = f"Invoice date differs by {days} day(s), within {date_tolerance}-day threshold (PR: {pr.invoice_date}, 2B: {twob.invoice_date})"

        # Tax Structure / Place of Supply Mismatch Check (Intra-state CGST/SGST vs Inter-state IGST)
        tax_structure_mismatch = False
        tax_structure_reason = None
        if pr and twob:
            pr_cgst = cls._to_decimal(getattr(pr, "cgst", 0))
            pr_sgst = cls._to_decimal(getattr(pr, "sgst", 0))
            pr_igst = cls._to_decimal(getattr(pr, "igst", 0))
            twob_cgst = cls._to_decimal(getattr(twob, "cgst", 0))
            twob_sgst = cls._to_decimal(getattr(twob, "sgst", 0))
            twob_igst = cls._to_decimal(getattr(twob, "igst", 0))

            pr_has_intra = (pr_cgst > tolerance or pr_sgst > tolerance)
            pr_has_inter = (pr_igst > tolerance)
            twob_has_intra = (twob_cgst > tolerance or twob_sgst > tolerance)
            twob_has_inter = (twob_igst > tolerance)

            if (pr_has_intra and twob_has_inter and not pr_has_inter and not twob_has_intra) or \
               (pr_has_inter and twob_has_intra and not pr_has_intra and not twob_has_inter):
                tax_structure_mismatch = True
                tax_structure_reason = (
                    "Tax structure mismatch: One record is classified as Intra-state (CGST/SGST) while the other "
                    "is Inter-state (IGST). Under GST law, these cannot be automatically offset without a credit note/amendment."
                )

        # Determine Highest Applicable Severity: MAJOR > MINOR > NONE
        major_fields = [f for f in field_evaluations if f.severity == SEVERITY_MAJOR]
        minor_fields = [f for f in field_evaluations if f.severity == SEVERITY_MINOR]

        details_dict: Dict[str, Any] = {
            "fields": {
                f.field_name: {
                    "purchase_register": f"{f.purchase_value:.2f}",
                    "gstr2b": f"{f.gstr2b_value:.2f}",
                    "difference": f"{f.difference:.2f}",
                    "absolute_difference": f"{f.absolute_difference:.2f}",
                    "percentage": f"{f.percentage:.2f}%" if f.percentage is not None else "N/A",
                    "severity": f.severity,
                    "reason": f.reason,
                }
                for f in field_evaluations
                if f.severity != SEVERITY_NONE
            },
            "tolerance": f"{tolerance:.2f}",
            "absolute_threshold": f"{abs_threshold:.2f}",
            "percentage_threshold": f"{pct_threshold * 100:.1f}%",
        }

        if date_discrepancy:
            details_dict["date_discrepancy"] = date_reason
        if tax_structure_mismatch:
            details_dict["tax_structure_mismatch"] = tax_structure_reason

        # 1. Tax structure mismatch is fundamentally Major
        if tax_structure_mismatch:
            return DiscrepancyClassification(
                severity=SEVERITY_MAJOR,
                reason=tax_structure_reason,
                rule_applied="TAX_STRUCTURE_MISMATCH_MAJOR",
                field_discrepancies=field_evaluations,
                details=details_dict,
            )

        # 2. Major financial field differences
        if major_fields:
            primary = major_fields[0]
            pct_str = f" ({primary.percentage:.2f}%)" if primary.percentage is not None else ""
            reason = (
                f"Major discrepancy in {primary.field_name}: difference of INR {primary.absolute_difference:.2f}{pct_str} "
                f"exceeds materiality threshold (INR {abs_threshold:.2f} or {pct_threshold * 100:.1f}%)."
            )
            return DiscrepancyClassification(
                severity=SEVERITY_MAJOR,
                reason=reason,
                rule_applied="FINANCIAL_MATERIALITY_MAJOR",
                field_discrepancies=field_evaluations,
                details=details_dict,
            )

        # 3. Date difference exceeding configured tolerance
        if date_exceeds_tolerance:
            return DiscrepancyClassification(
                severity=SEVERITY_MAJOR,
                reason=f"Major discrepancy: {date_reason}.",
                rule_applied="DATE_VARIATION_MAJOR",
                field_discrepancies=field_evaluations,
                details=details_dict,
            )

        # 4. Minor financial field differences
        if minor_fields:
            primary = minor_fields[0]
            pct_str = f" ({primary.percentage:.2f}%)" if primary.percentage is not None else ""
            reason = (
                f"Minor discrepancy in {primary.field_name}: difference of INR {primary.absolute_difference:.2f}{pct_str} "
                f"exceeds tolerance INR {tolerance:.2f} but remains within materiality thresholds (INR {abs_threshold:.2f} / {pct_threshold * 100:.1f}%)."
            )
            return DiscrepancyClassification(
                severity=SEVERITY_MINOR,
                reason=reason,
                rule_applied="FINANCIAL_MATERIALITY_MINOR",
                field_discrepancies=field_evaluations,
                details=details_dict,
            )

        # 5. Minor date difference within tolerance
        if date_discrepancy:
            return DiscrepancyClassification(
                severity=SEVERITY_MINOR,
                reason=f"Minor discrepancy: {date_reason}.",
                rule_applied="DATE_VARIATION_MINOR",
                field_discrepancies=field_evaluations,
                details=details_dict,
            )

        # If all monetary fields are within tolerance and no date diff:
        return DiscrepancyClassification(
            severity=SEVERITY_NONE,
            reason=f"All fields reconcile within tolerance (INR {tolerance:.2f}).",
            rule_applied="ALL_FIELDS_WITHIN_TOLERANCE_NONE",
            field_discrepancies=field_evaluations,
            details=details_dict,
        )

    @classmethod
    def _evaluate_monetary_field(
        cls,
        field_name: str,
        pr_val: Decimal,
        twob_val: Decimal,
        tolerance: Decimal,
        abs_threshold: Decimal,
        pct_threshold: Decimal,
    ) -> FieldDiscrepancy:
        """
        Evaluates a single monetary field difference using strict Decimal arithmetic.
        Formula: diff = (pr_val - twob_val)
        """
        diff = pr_val - twob_val
        abs_diff = abs(diff)

        # Check tolerance (inclusive)
        if abs_diff <= tolerance:
            return FieldDiscrepancy(
                field_name=field_name,
                purchase_value=pr_val,
                gstr2b_value=twob_val,
                difference=diff,
                absolute_difference=abs_diff,
                relative_difference=Decimal("0.00"),
                percentage=Decimal("0.00"),
                severity=SEVERITY_NONE,
                reason="Within matching tolerance",
            )

        # Reference amount determination: GSTR-2B portal value is authoritative reference benchmark.
        # Handle zero reference amounts safely without ZeroDivisionError.
        ref_amount = abs(twob_val) if twob_val is not None else Decimal("0.00")

        if ref_amount > Decimal("0.00"):
            rel_diff = abs_diff / ref_amount
            percentage = rel_diff * Decimal("100.0")
        else:
            # Zero reference amount: relative percentage is undefined; evaluate purely on absolute threshold
            rel_diff = None
            percentage = None

        # Materiality rule: Absolute difference > ₹1,000 OR Relative difference > 1% (0.01)
        exceeds_abs = abs_diff > abs_threshold
        exceeds_pct = (rel_diff is not None) and (rel_diff > pct_threshold)

        if exceeds_abs or exceeds_pct:
            sev = SEVERITY_MAJOR
            if exceeds_abs and exceeds_pct:
                reasons = f"Exceeds absolute threshold (INR {abs_diff:.2f} > INR {abs_threshold:.2f}) and relative threshold ({percentage:.2f}% > {pct_threshold * 100:.1f}%)"
            elif exceeds_abs:
                reasons = f"Exceeds absolute threshold (INR {abs_diff:.2f} > INR {abs_threshold:.2f})"
            else:
                reasons = f"Exceeds relative threshold ({percentage:.2f}% > {pct_threshold * 100:.1f}%)"
        else:
            sev = SEVERITY_MINOR
            pct_text = f" ({percentage:.2f}%)" if percentage is not None else ""
            reasons = f"Diff INR {abs_diff:.2f}{pct_text} exceeds tolerance INR {tolerance:.2f} but remains within materiality thresholds"

        return FieldDiscrepancy(
            field_name=field_name,
            purchase_value=pr_val,
            gstr2b_value=twob_val,
            difference=diff,
            absolute_difference=abs_diff,
            relative_difference=rel_diff,
            percentage=percentage,
            severity=sev,
            reason=reasons,
        )

    @staticmethod
    def _to_decimal(val: Any) -> Decimal:
        """Safely parses any numeric or string representation into a Decimal without float rounding errors."""
        if val is None:
            return Decimal("0.00")
        if isinstance(val, Decimal):
            return val
        try:
            cleaned = str(val).strip().replace(",", "")
            if not cleaned or cleaned.lower() == "none":
                return Decimal("0.00")
            return Decimal(cleaned)
        except (InvalidOperation, TypeError, ValueError):
            return Decimal("0.00")
