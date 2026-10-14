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
    Index
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

    __table_args__ = (
        Index("ix_gstr2b_records_job_gstin_inv", "job_id", "supplier_gstin", "invoice_number"),
    )
