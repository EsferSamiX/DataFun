import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    profiles: Mapped[list["Profile"]] = relationship(back_populates="user")


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (UniqueConstraint("user_id", "file_hash", name="uq_user_file_hash"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    file_hash: Mapped[str] = mapped_column(String, nullable=False)
    file_format: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    num_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    num_columns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    raw_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    preprocessing_ops: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    preprocessed_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="profiles")
    suggestions: Mapped[list["Suggestion"]] = relationship(back_populates="profile")
    embedding: Mapped["ProfileEmbedding | None"] = relationship(
        back_populates="profile", uselist=False
    )
    trained_models: Mapped[list["TrainedModel"]] = relationship(back_populates="profile")


class Suggestion(Base):
    __tablename__ = "suggestions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    task_type: Mapped[str] = mapped_column(String, nullable=False)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    profile: Mapped["Profile"] = relationship(back_populates="suggestions")


class ProfileEmbedding(Base):
    __tablename__ = "profile_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), primary_key=True
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)

    profile: Mapped["Profile"] = relationship(back_populates="embedding")


class TrainedModel(Base):
    __tablename__ = "trained_models"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    model_name: Mapped[str] = mapped_column(String, nullable=False)
    task_type: Mapped[str] = mapped_column(String, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False)
    feature_names: Mapped[list] = mapped_column(JSON, nullable=False)
    target_classes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    confusion_matrix_png: Mapped[str | None] = mapped_column(Text, nullable=True)
    feature_importance_png: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    training_time_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_column:               Mapped[str | None]  = mapped_column(String, nullable=True)
    test_rows:                   Mapped[list | None]  = mapped_column(JSON,   nullable=True)
    roc_curve_png:               Mapped[str | None]   = mapped_column(Text,   nullable=True)
    residual_plot_png:           Mapped[str | None]   = mapped_column(Text,   nullable=True)
    ts_actual_vs_predicted_png:  Mapped[str | None]   = mapped_column(Text,   nullable=True)
    learning_curve_png:          Mapped[str | None]   = mapped_column(Text,   nullable=True)
    classification_report_text:  Mapped[str | None]   = mapped_column(Text,   nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    profile: Mapped["Profile"] = relationship(back_populates="trained_models")
