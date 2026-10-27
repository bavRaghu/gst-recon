import uuid
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column, 
    String, 
    Integer, 
    Date, 
    Numeric, 
    DateTime, 
    ForeignKey, 
    Index,
    JSON,
    Text
)
from sqlalchemy.orm import relationship
from .database import Base


class ReconciliationJob(Base):
    __tablename__ = "reconciliation_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    status = Column(String(50), default="UPLOADED", nullable=False)

    # Relationships to child records
    purchase_records = relationship(
        "PurchaseRecord", 
        back_populates="job", 
        cascade="all, delete-orphan",
        order_by="PurchaseRecord.id"
    )
    gstr2b_records = relationship(
        "Gstr2bRecord", 
        back_populates="job", 
        cascade="all, delete-orphan",
        order_by="Gstr2bRecord.id"
    )
    reconciliation_results = relationship(
        "ReconciliationResult",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="ReconciliationResult.id"
    )
    reconciliation_proposals = relationship(
        "ReconciliationProposal",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="ReconciliationProposal.id"
    )
    vendor_communications = relationship(
        "VendorCommunication",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="VendorCommunication.created_at.desc()"
    )
    discrepancy_items = relationship(
        "DiscrepancyItem",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="DiscrepancyItem.created_at.desc()"
    )

    __table_args__ = (
        Index("ix_reconciliation_jobs_created_at", "created_at"),
    )


class PurchaseRecord(Base):
    __tablename__ = "purchase_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(
        String(36), 
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    supplier_gstin = Column(String(15), nullable=False, index=True)
    invoice_number = Column(String(64), nullable=False, index=True)
    invoice_date = Column(Date, nullable=False)
    taxable_value = Column(Numeric(15, 2), nullable=False)
    cgst = Column(Numeric(15, 2), nullable=False)
    sgst = Column(Numeric(15, 2), nullable=False)
    igst = Column(Numeric(15, 2), nullable=False)

    job = relationship("ReconciliationJob", back_populates="purchase_records")
    reconciliation_results = relationship("ReconciliationResult", back_populates="purchase_record")

    __table_args__ = (
        Index("ix_purchase_records_job_gstin_inv", "job_id", "supplier_gstin", "invoice_number"),
    )


class Gstr2bRecord(Base):
    __tablename__ = "gstr2b_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(
        String(36), 
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    supplier_gstin = Column(String(15), nullable=False, index=True)
    invoice_number = Column(String(64), nullable=False, index=True)
    invoice_date = Column(Date, nullable=False)
    taxable_value = Column(Numeric(15, 2), nullable=False)
    cgst = Column(Numeric(15, 2), nullable=False)
    sgst = Column(Numeric(15, 2), nullable=False)
    igst = Column(Numeric(15, 2), nullable=False)

    job = relationship("ReconciliationJob", back_populates="gstr2b_records")
    reconciliation_results = relationship("ReconciliationResult", back_populates="gstr2b_record")

    __table_args__ = (
        Index("ix_gstr2b_records_job_gstin_inv", "job_id", "supplier_gstin", "invoice_number"),
    )


class ReconciliationResult(Base):
    __tablename__ = "reconciliation_results"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(
        String(36), 
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    purchase_record_id = Column(
        Integer, 
        ForeignKey("purchase_records.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    gstr2b_record_id = Column(
        Integer, 
        ForeignKey("gstr2b_records.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    # Required statuses: MATCHED, MISMATCH, MISSING_IN_GSTR2B, MISSING_IN_PURCHASE_REGISTER, DUPLICATE_AMBIGUOUS
    status = Column(String(32), nullable=False, index=True)
    # Severity classification: MAJOR, MINOR, NONE, UNCLASSIFIED
    severity = Column(String(32), nullable=False, default="UNCLASSIFIED", index=True)
    severity_reason = Column(Text, nullable=True)
    discrepancy_details = Column(JSON, nullable=True)
    differences = Column(JSON, nullable=False, default=dict)
    ambiguity_metadata = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc), 
        nullable=False
    )

    job = relationship("ReconciliationJob", back_populates="reconciliation_results")
    purchase_record = relationship("PurchaseRecord", back_populates="reconciliation_results")
    gstr2b_record = relationship("Gstr2bRecord", back_populates="reconciliation_results")
    proposals = relationship(
        "ReconciliationProposal", 
        back_populates="result", 
        cascade="all, delete-orphan",
        order_by="ReconciliationProposal.id"
    )
    vendor_communications = relationship(
        "VendorCommunication",
        back_populates="result",
        cascade="all, delete-orphan",
        order_by="VendorCommunication.created_at.desc()"
    )
    discrepancy_item = relationship(
        "DiscrepancyItem",
        back_populates="result",
        uselist=False,
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_recon_results_job_status", "job_id", "status"),
    )


class ReconciliationProposal(Base):
    __tablename__ = "reconciliation_proposals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(
        String(36), 
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    result_id = Column(
        String(36), 
        ForeignKey("reconciliation_results.id", ondelete="CASCADE"), 
        nullable=True, 
        index=True
    )
    source_record_type = Column(String(32), nullable=False)  # 'purchase_record' or 'gstr2b_record'
    source_record_id = Column(Integer, nullable=False, index=True)
    candidate_record_id = Column(Integer, nullable=False, index=True)
    assessment_status = Column(String(32), nullable=False)  # 'PROPOSED', 'REJECTED', 'SKIPPED', 'UNAVAILABLE', 'ERROR'
    confidence = Column(String(16), nullable=True)  # 'HIGH', 'MEDIUM', 'LOW', 'UNCERTAIN'
    reasoning = Column(Text, nullable=False)
    conflicting_evidence = Column(Text, nullable=True)
    model_metadata = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )

    job = relationship("ReconciliationJob", back_populates="reconciliation_proposals")
    result = relationship("ReconciliationResult", back_populates="proposals")
    audit_logs = relationship(
        "ProposalAuditLog",
        back_populates="proposal",
        cascade="all, delete-orphan",
        order_by="ProposalAuditLog.created_at"
    )

    __table_args__ = (
        Index("ix_recon_proposals_job_source", "job_id", "source_record_type", "source_record_id"),
    )


class ProposalAuditLog(Base):
    __tablename__ = "proposal_audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(
        String(36),
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    proposal_id = Column(
        String(36),
        ForeignKey("reconciliation_proposals.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    action = Column(String(32), nullable=False)  # 'CONFIRM_MATCH', 'REJECT_MATCH'
    reviewed_by = Column(String(128), default="Accountant", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    proposal = relationship("ReconciliationProposal", back_populates="audit_logs")
    job = relationship("ReconciliationJob")

    __table_args__ = (
        Index("ix_proposal_audit_job_proposal", "job_id", "proposal_id"),
    )


class VendorContact(Base):
    """Stores verified supplier contact details keyed by GSTIN."""
    __tablename__ = "vendor_contacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_gstin = Column(String(15), unique=True, nullable=False, index=True)
    supplier_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    contact_person = Column(String(128), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc), 
        nullable=False
    )


class VendorCommunication(Base):
    """Persisted history of GST discrepancy notices drafted or sent to vendors."""
    __tablename__ = "vendor_communications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(
        String(36), 
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    result_id = Column(
        String(36), 
        ForeignKey("reconciliation_results.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    supplier_gstin = Column(String(15), nullable=False, index=True)
    supplier_name = Column(String(255), nullable=True)
    recipient_email = Column(String(255), nullable=False)
    cc_email = Column(String(255), nullable=True)
    subject = Column(String(512), nullable=False)
    body = Column(Text, nullable=False)
    template_type = Column(String(32), default="standard", nullable=False)  # 'standard', 'urgent', 'amendment'
    status = Column(String(32), default="DRAFT", nullable=False, index=True)  # 'DRAFT', 'SENT', 'FAILED'
    sending_mode = Column(String(32), default="test", nullable=False)  # 'test', 'live'
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc), 
        nullable=False
    )

    job = relationship("ReconciliationJob", back_populates="vendor_communications")
    result = relationship("ReconciliationResult", back_populates="vendor_communications")

    __table_args__ = (
        Index("ix_vendor_comm_job_result", "job_id", "result_id"),
        Index("ix_vendor_comm_status", "status"),
    )


class DiscrepancyItem(Base):
    """
    Stores authoritative, deterministic discrepancy analysis, field-level differences,
    severity classification, AI inspection recommendations, and human verification status.
    """
    __tablename__ = "discrepancy_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(
        String(36), 
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    result_id = Column(
        String(36), 
        ForeignKey("reconciliation_results.id", ondelete="CASCADE"), 
        nullable=False, 
        unique=True,
        index=True
    )
    discrepancy_type = Column(String(64), nullable=False, index=True)
    # Severity: 'MAJOR', 'MINOR', 'REVIEW_REQUIRED', 'UNCLASSIFIED'
    severity = Column(String(32), nullable=False, index=True)
    original_severity = Column(String(32), nullable=False)
    severity_reason = Column(Text, nullable=False)
    rule_applied = Column(String(128), nullable=False)
    affected_fields = Column(JSON, nullable=False, default=list)
    expected_and_actual = Column(JSON, nullable=False, default=dict)
    difference_amount = Column(Numeric(15, 2), nullable=False, default=Decimal("0.00"))
    ai_explanation = Column(Text, nullable=True)
    ai_suggested_fields = Column(JSON, nullable=True)
    
    # Verification Status:
    # 'PENDING': Awaiting human verification
    # 'APPROVED': Verified without severity change
    # 'OVERRIDDEN': Severity manually overridden by reviewer
    # 'REQUIRES_VENDOR_CORRECTION': Explicitly verified as requiring vendor correction (ONLY these enter Vendor Communication)
    # 'INVESTIGATION_REQUIRED': Marked for internal investigation
    # 'REJECTED': Rejected / disputed by reviewer
    # 'RESOLVED': Discrepancy verified as resolved (e.g. after re-reconciliation)
    verification_status = Column(String(32), nullable=False, default="PENDING", index=True)
    requires_vendor_action = Column(Boolean, nullable=False, default=False, index=True)
    resolution_notes = Column(Text, nullable=True)

    classified_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(String(128), nullable=True)
    created_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc), 
        nullable=False
    )

    job = relationship("ReconciliationJob", back_populates="discrepancy_items")
    result = relationship("ReconciliationResult", back_populates="discrepancy_item")
    audit_logs = relationship(
        "DiscrepancyAuditLog",
        back_populates="discrepancy",
        cascade="all, delete-orphan",
        order_by="DiscrepancyAuditLog.created_at.desc()"
    )

    __table_args__ = (
        Index("ix_discrepancy_job_severity", "job_id", "severity"),
        Index("ix_discrepancy_job_verification", "job_id", "verification_status"),
        Index("ix_discrepancy_vendor_action", "job_id", "severity", "requires_vendor_action"),
    )


class DiscrepancyAuditLog(Base):
    """
    Immutable audit trail recording every human verification action, override, comment,
    status transition, and timestamp for discrepancy review.
    """
    __tablename__ = "discrepancy_audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    discrepancy_id = Column(
        String(36),
        ForeignKey("discrepancy_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    job_id = Column(
        String(36),
        ForeignKey("reconciliation_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    action = Column(String(64), nullable=False)
    previous_status = Column(String(32), nullable=True)
    new_status = Column(String(32), nullable=False)
    previous_severity = Column(String(32), nullable=True)
    new_severity = Column(String(32), nullable=True)
    reviewer_name = Column(String(128), default="Accountant", nullable=False)
    comments = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    discrepancy = relationship("DiscrepancyItem", back_populates="audit_logs")
    job = relationship("ReconciliationJob")

    __table_args__ = (
        Index("ix_discrepancy_audit_job_discrepancy", "job_id", "discrepancy_id"),
        Index("ix_discrepancy_audit_created_at", "created_at"),
    )

