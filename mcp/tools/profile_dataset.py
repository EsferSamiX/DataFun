"""profile_dataset MCP tool.

Receives raw file bytes + filename, writes to a temp file, loads it with
the format_loader, runs the profiler, and returns a ProfileResult dict.
"""

from __future__ import annotations

import base64
import tempfile
from pathlib import Path

from core.format_loader import load_dataframe
from core.profiler import profile_dataframe


async def profile_dataset(
    file_bytes: str,
    filename: str,
    target_column: str | None = None,
    sample_size: int | None = None,
    depth: str = "standard",
) -> dict:
    """Profile a dataset and return a full ProfileResult.

    Detects file format from the filename extension.
    Runs pandas + scipy statistics — no LLM involved.

    Args:
        file_bytes: Raw bytes of the uploaded file.
        filename: Original filename including extension (used for format detection).
        target_column: Optional column name to use as ML target.
        sample_size: If set, randomly sample this many rows before profiling.
        depth: "quick" (skip correlations), "standard", or "deep".

    Returns:
        ProfileResult as a JSON-safe plain dict.
    """
    # Preserve the original extension so format_loader detects it correctly.
    # For compound extensions (.csv.gz etc.) we need the full suffix chain.
    name_lower = filename.lower()
    compound_suffixes = (
        ".csv.gz", ".csv.bz2", ".csv.zip", ".json.gz", ".parquet.gz",
    )

    suffix = ""
    for cs in compound_suffixes:
        if name_lower.endswith(cs):
            suffix = cs
            break
    if not suffix:
        suffix = Path(filename).suffix  # e.g. ".csv"

    tmp_path: Path | None = None
    try:
        # Decode base64 → raw bytes and write to temp file
        raw_bytes = base64.b64decode(file_bytes)
        with tempfile.NamedTemporaryFile(
            suffix=suffix, delete=False, dir=tempfile.gettempdir()
        ) as tmp:
            tmp.write(raw_bytes)
            tmp_path = Path(tmp.name)

        df = load_dataframe(tmp_path)
        result = profile_dataframe(
            df,
            target_column=target_column,
            sample_size=sample_size,
            depth=depth,
        )
        return result.to_dict()

    finally:
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
