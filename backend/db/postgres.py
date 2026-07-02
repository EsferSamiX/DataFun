from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.config import settings
from db.models import Base

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        # Enable pgvector extension
        await conn.execute(
            __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS vector")
        )
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns to trained_models if they don't exist yet (idempotent)
        new_cols = [
            ("target_column",              "TEXT"),
            ("test_rows",                  "JSONB"),
            ("roc_curve_png",              "TEXT"),
            ("residual_plot_png",          "TEXT"),
            ("ts_actual_vs_predicted_png", "TEXT"),
            ("learning_curve_png",         "TEXT"),
            ("classification_report_text", "TEXT"),
        ]
        for col_name, col_type in new_cols:
            await conn.execute(__import__("sqlalchemy").text(
                f"ALTER TABLE trained_models ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
            ))


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
