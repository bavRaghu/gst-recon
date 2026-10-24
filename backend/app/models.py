import uuid
from datetime import datetime, timezone
from sqlalchemy import (
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

    __table_args__ = (
        Index("ix_recon_proposals_job_source", "job_id", "source_record_type", "source_record_id"),
    )
