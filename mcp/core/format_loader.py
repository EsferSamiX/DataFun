"""Auto-detecting file format loader for DataFun MCP server.

Supports 38 file formats across 8 categories. Format is detected from
the filename extension. Compound extensions (.csv.gz etc.) are checked
before single-suffix extensions.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any


def _flatten_nested_columns(df: Any) -> Any:
    """Flatten one level of dict-valued columns and stringify list-valued columns.

    - Dict columns are expanded via pd.json_normalize and merged back.
    - List columns are converted to their string representation so downstream
      operations remain safe (duplicated(), value_counts(), etc.).
    """
    import pandas as pd

    cols_to_expand: list[str] = []
    cols_to_stringify: list[str] = []

    for col in df.columns:
        non_null = df[col].dropna()
        if len(non_null) == 0:
            continue
        first = non_null.iloc[0]
        if isinstance(first, dict):
            cols_to_expand.append(col)
        elif isinstance(first, list):
            cols_to_stringify.append(col)

    for col in cols_to_expand:
        try:
            expanded = pd.json_normalize(df[col].tolist())
            expanded.columns = [f"{col}.{sub}" for sub in expanded.columns]
            expanded.index = df.index
            df = pd.concat([df.drop(columns=[col]), expanded], axis=1)
        except Exception:
            pass

    for col in cols_to_stringify:
        df = df.copy()
        df[col] = df[col].apply(lambda v: str(v) if isinstance(v, list) else v)

    return df


def _load_arrow(path: Path) -> Any:
    """Load an Arrow IPC file with a 3-tier fallback.

    Tier 1: pd.read_feather() — standard Arrow IPC / Feather v2
    Tier 2: pyarrow.ipc.open_stream() — HuggingFace RecordBatch stream
    Tier 3: datasets.Dataset.from_file() — HuggingFace datasets library
    """
    import pandas as pd

    try:
        return pd.read_feather(path)
    except Exception:
        pass

    try:
        import pyarrow.ipc as _ipc

        with open(path, "rb") as fh:
            reader = _ipc.open_stream(fh)
            table = reader.read_all()
            return table.to_pandas()
    except Exception:
        pass

    try:
        from datasets import Dataset as _HFDataset  # type: ignore[import-untyped]

        return _HFDataset.from_file(str(path)).to_pandas()
    except Exception:
        pass

    raise ValueError(
        f"Cannot read Arrow file '{path}'. "
        "Tried pd.read_feather(), pyarrow RecordBatchStreamReader, and HuggingFace datasets. "
        "Ensure the file is a valid Arrow IPC or HuggingFace-format .arrow file."
    )


def _load_mat(path: Path) -> Any:
    """Load a MATLAB .mat file into a DataFrame.

    Skips MATLAB metadata keys (__header__, __version__, __globals__).
    Takes the first data variable and converts it to a DataFrame.
    """
    import pandas as pd
    import scipy.io as sio

    mat = sio.loadmat(str(path))
    data_keys = [k for k in mat if not k.startswith("__")]
    if not data_keys:
        raise ValueError(
            f"No numeric data found in .mat file '{path}'. "
            "The file contains only MATLAB metadata."
        )
    first_key = data_keys[0]
    data = mat[first_key]
    try:
        return pd.DataFrame(data)
    except Exception as exc:
        raise ValueError(
            f"Cannot convert .mat variable '{first_key}' to DataFrame: {exc}"
        ) from exc


def _load_sqlite(path: Path) -> Any:
    """Load the first table from a SQLite database file."""
    import pandas as pd

    conn = sqlite3.connect(str(path))
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = cursor.fetchall()
        if not tables:
            raise ValueError(f"SQLite file '{path}' contains no tables.")
        table_name = tables[0][0]
        df = pd.read_sql(f'SELECT * FROM "{table_name}"', conn)  # noqa: S608
        return df
    finally:
        conn.close()


def load_dataframe(path: Path) -> Any:
    """Load a file into a pandas DataFrame, auto-detecting format by extension.

    Compound extensions (.csv.gz, .csv.bz2, .csv.zip, .json.gz) are matched
    before single-suffix extensions to ensure correct dispatch.

    Args:
        path: Absolute path to the file.

    Returns:
        pandas DataFrame.

    Raises:
        ValueError: If the extension is not supported.
    """
    import numpy as np
    import pandas as pd

    name = path.name.lower()

    # ── Compressed compound extensions (must come first) ──────────────────
    if name.endswith(".csv.gz"):
        return pd.read_csv(path, compression="gzip")
    if name.endswith(".csv.bz2"):
        return pd.read_csv(path, compression="bz2")
    if name.endswith(".csv.zip"):
        return pd.read_csv(path, compression="zip")
    if name.endswith(".json.gz"):
        return _flatten_nested_columns(pd.read_json(path, compression="gzip"))
    if name.endswith(".parquet.gz"):
        # pyarrow / fastparquet handle gzip internally
        return pd.read_parquet(path)

    # ── Single-suffix dispatch ─────────────────────────────────────────────
    suffix = Path(name).suffix  # single last extension

    # Delimited text
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".tsv":
        return pd.read_csv(path, sep="\t")
    if suffix == ".txt":
        return pd.read_csv(path, sep=None, engine="python")
    if suffix == ".dat":
        return pd.read_csv(path, sep=r"\s+")

    # Excel / Spreadsheets
    if suffix == ".xlsx":
        return pd.read_excel(path)
    if suffix == ".xls":
        return pd.read_excel(path)
    if suffix == ".xlsm":
        return pd.read_excel(path)
    if suffix == ".xlsb":
        return pd.read_excel(path, engine="pyxlsb")
    if suffix == ".ods":
        return pd.read_excel(path, engine="odf")

    # Columnar / binary
    if suffix == ".parquet":
        return pd.read_parquet(path)
    if suffix == ".feather":
        return pd.read_feather(path)
    if suffix in (".arrow", ".ipc"):
        return _load_arrow(path)
    if suffix == ".orc":
        return pd.read_orc(path)

    # Semi-structured
    if suffix == ".json":
        return _flatten_nested_columns(pd.read_json(path))
    if suffix in (".jsonl", ".ndjson"):
        return _flatten_nested_columns(pd.read_json(path, lines=True))
    if suffix == ".xml":
        return pd.read_xml(path)

    # Scientific / numerical
    if suffix == ".npy":
        data = np.load(path, allow_pickle=False)
        return pd.DataFrame(data)
    if suffix == ".npz":
        data = np.load(path, allow_pickle=False)
        first_key = list(data.keys())[0]
        return pd.DataFrame(data[first_key])
    if suffix in (".h5", ".hdf5"):
        return pd.read_hdf(path)
    if suffix == ".mat":
        return _load_mat(path)

    # Statistical software
    if suffix == ".sas7bdat":
        return pd.read_sas(path)
    if suffix == ".xpt":
        return pd.read_sas(path, format="xport")
    if suffix in (".sav", ".zsav"):
        import pyreadstat  # type: ignore[import-untyped]

        df, _ = pyreadstat.read_sav(str(path))
        return df
    if suffix == ".dta":
        return pd.read_stata(path)
    if suffix == ".por":
        import pyreadstat  # type: ignore[import-untyped]

        df, _ = pyreadstat.read_por(str(path))
        return df

    # Database exports
    if suffix in (".db", ".sqlite", ".sqlite3"):
        return _load_sqlite(path)

    # Compressed archives (single-suffix)
    if suffix in (".pkl", ".pickle"):
        return pd.read_pickle(path)

    raise ValueError(
        f"Unsupported file extension '{suffix}' (filename: '{path.name}'). "
        "Supported formats include: .csv, .tsv, .txt, .dat, .xlsx, .xls, .xlsm, .xlsb, .ods, "
        ".parquet, .feather, .arrow, .ipc, .orc, .json, .jsonl, .ndjson, .xml, "
        ".npy, .npz, .h5, .hdf5, .mat, .sas7bdat, .xpt, .sav, .zsav, .dta, .por, "
        ".db, .sqlite, .sqlite3, .pkl, .pickle, "
        ".csv.gz, .csv.bz2, .csv.zip, .json.gz, .parquet.gz"
    )
