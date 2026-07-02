"""Chart generation for DataFun — produces base64 PNG strings via matplotlib."""

from __future__ import annotations

import base64
import io
from typing import Any

import matplotlib
matplotlib.use("Agg")  # headless, no display required
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np


# ── Shared style ──────────────────────────────────────────────────────────────

_PALETTE = [
    "#4f86f7", "#f97316", "#22c55e", "#a855f7",
    "#ec4899", "#14b8a6", "#f59e0b", "#64748b",
]

def _fig_to_b64(fig: plt.Figure) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=130)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


# ── Plot 1: Column distributions ─────────────────────────────────────────────

def column_distribution_plots(
    df: Any,
    columns: list[dict[str, Any]],
    max_categories: int = 15,
) -> dict[str, str]:
    """Return {col_name: base64_png} for each column."""
    import pandas as pd
    plots: dict[str, str] = {}

    for col_info in columns:
        col = col_info["name"]
        col_type = col_info.get("type", "string")
        if col not in df.columns:
            continue

        series = df[col].dropna()
        if len(series) == 0:
            continue

        try:
            fig, ax = plt.subplots(figsize=(5, 3))
            fig.patch.set_facecolor("white")
            ax.set_facecolor("white")

            if col_type in ("integer", "float"):
                if series.nunique() <= 20:
                    # Low-cardinality: bar chart
                    vc = series.value_counts().sort_index()
                    colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(vc))]
                    ax.bar(vc.index.astype(str), vc.values, color=colors,
                           edgecolor="white", linewidth=0.5)
                    ax.set_xlabel(col, fontsize=9, color="#374151")
                    ax.set_ylabel("Count", fontsize=9, color="#374151")
                    ax.yaxis.set_major_locator(mticker.MaxNLocator(integer=True))
                else:
                    ax.hist(series.astype(float), bins=min(30, max(10, len(series) // 20)),
                            color=_PALETTE[0], edgecolor="white", linewidth=0.4, alpha=0.85)
                    ax.set_xlabel(col, fontsize=9, color="#374151")
                    ax.set_ylabel("Count", fontsize=9, color="#374151")
                    ax.yaxis.set_major_locator(mticker.MaxNLocator(integer=True))

            elif col_type == "datetime":
                parsed = pd.to_datetime(series, errors="coerce").dropna()
                if len(parsed) == 0:
                    plt.close(fig)
                    continue
                ax.hist(parsed, bins=min(20, len(parsed)), color=_PALETTE[2],
                        edgecolor="white", linewidth=0.4, alpha=0.85)
                fig.autofmt_xdate(rotation=30)
                ax.set_xlabel(col, fontsize=9, color="#374151")
                ax.set_ylabel("Count", fontsize=9, color="#374151")

            else:  # string / categorical / boolean
                vc = series.value_counts().head(max_categories)
                colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(vc))]
                bars = ax.bar(vc.index.astype(str), vc.values,
                              color=colors, edgecolor="white", linewidth=0.3)
                ax.set_xlabel(col, fontsize=9, color="#374151")
                ax.set_ylabel("Count", fontsize=9, color="#374151")
                for bar in bars:
                    h = bar.get_height()
                    ax.text(bar.get_x() + bar.get_width() / 2, h + max(vc.values) * 0.01,
                            f"{int(h):,}", ha="center", va="bottom", fontsize=7, color="#374151")

            ax.set_title(f"Distribution — {col}", fontsize=10, fontweight="bold", pad=8, color="#111827")
            ax.tick_params(labelsize=8, colors="#374151")
            for spine in ax.spines.values():
                spine.set_edgecolor("#d1d5db")
            fig.tight_layout()
            plots[col] = _fig_to_b64(fig)

        except Exception:
            plt.close("all")
            continue

    return plots


# ── Plot 2: Correlation heatmap ───────────────────────────────────────────────

def correlation_heatmap(df: Any, max_cols: int = 20) -> str | None:
    """Return base64 PNG heatmap of numeric pairwise correlations."""
    try:
        numeric = df.select_dtypes(include="number")
        if numeric.shape[1] < 2:
            return None
        # Cap columns to avoid huge heatmaps
        if numeric.shape[1] > max_cols:
            numeric = numeric.iloc[:, :max_cols]

        corr = numeric.corr()
        n = len(corr)
        size = max(5, min(12, n * 0.7))
        fig, ax = plt.subplots(figsize=(size, size * 0.85))
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")

        import matplotlib.colors as mcolors
        cmap = plt.cm.RdYlGn

        im = ax.imshow(corr.values, cmap=cmap, vmin=-1, vmax=1, aspect="auto")
        cb = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cb.ax.yaxis.set_tick_params(color="#374151")
        plt.setp(cb.ax.yaxis.get_ticklabels(), color="#374151")

        ax.set_xticks(range(n))
        ax.set_yticks(range(n))
        ax.set_xticklabels(corr.columns, rotation=45, ha="right", fontsize=8, color="#111827")
        ax.set_yticklabels(corr.columns, fontsize=8, color="#111827")
        ax.tick_params(colors="#374151")
        for spine in ax.spines.values():
            spine.set_edgecolor("#d1d5db")

        for i in range(n):
            for j in range(n):
                val = corr.values[i, j]
                color = "#111827" if abs(val) < 0.6 else "white"
                ax.text(j, i, f"{val:.2f}", ha="center", va="center",
                        fontsize=7 if n > 8 else 9, color=color)

        ax.set_title("Correlation Heatmap", fontsize=11, fontweight="bold", pad=10, color="#111827")
        fig.tight_layout()
        return _fig_to_b64(fig)
    except Exception:
        plt.close("all")
        return None


# ── Plot 3: Missing values bar chart ─────────────────────────────────────────

def missing_values_chart(columns: list[dict[str, Any]]) -> str | None:
    """Return base64 PNG bar chart of % missing per column."""
    try:
        cols_with_missing = [c for c in columns if c.get("missing_pct", 0) > 0]
        if not cols_with_missing:
            return None

        # Sort descending
        cols_with_missing = sorted(cols_with_missing, key=lambda c: c["missing_pct"], reverse=True)
        names = [c["name"] for c in cols_with_missing]
        pcts = [c["missing_pct"] for c in cols_with_missing]

        height = max(3, len(names) * 0.4)
        fig, ax = plt.subplots(figsize=(7, height))
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")

        colors = ["#ef4444" if p > 50 else "#f59e0b" if p > 20 else "#4f86f7" for p in pcts]
        bars = ax.barh(names[::-1], pcts[::-1], color=colors[::-1],
                       edgecolor="white", linewidth=0.3)

        for bar, pct in zip(bars, pcts[::-1]):
            ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                    f"{pct:.1f}%", va="center", ha="left", fontsize=8, color="#374151")

        ax.set_xlim(0, min(110, max(pcts) * 1.15))
        ax.set_xlabel("Missing (%)", fontsize=9, color="#374151")
        ax.set_title("Missing Values per Column", fontsize=11, fontweight="bold", pad=10, color="#111827")
        ax.tick_params(labelsize=8, colors="#374151")
        ax.axvline(50, color="#ef4444", linewidth=0.8, linestyle="--", alpha=0.5)
        ax.axvline(20, color="#f59e0b", linewidth=0.8, linestyle="--", alpha=0.5)
        for spine in ax.spines.values():
            spine.set_edgecolor("#d1d5db")
        fig.tight_layout()
        return _fig_to_b64(fig)
    except Exception:
        plt.close("all")
        return None


# ── Plot 4: Target distribution ───────────────────────────────────────────────

def target_distribution_plot(df: Any, target_column: str) -> str | None:
    """Return base64 PNG showing the distribution of the target column."""
    if target_column not in df.columns:
        return None
    try:
        series = df[target_column].dropna()
        if len(series) == 0:
            return None

        import pandas as pd

        fig, ax = plt.subplots(figsize=(10, 4))
        fig.patch.set_facecolor("white")
        ax.set_facecolor("white")

        if pd.api.types.is_numeric_dtype(series) and series.nunique() > 10:
            ax.hist(series.astype(float), bins=min(40, max(10, len(series) // 20)),
                    color="#818cf8", edgecolor="white", linewidth=0.5, alpha=0.9)
            ax.set_xlabel(target_column, fontsize=11, color="#374151")
            ax.set_ylabel("Count", fontsize=11, color="#374151")
        else:
            vc = series.value_counts()
            colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(vc))]
            bars = ax.bar(vc.index.astype(str), vc.values, color=colors,
                          edgecolor="white", linewidth=0.5)
            ax.set_xlabel(target_column, fontsize=11, color="#374151")
            ax.set_ylabel("Count", fontsize=11, color="#374151")
            for bar in bars:
                h = bar.get_height()
                ax.text(bar.get_x() + bar.get_width() / 2, h + max(vc.values) * 0.01,
                        f"{int(h):,}", ha="center", va="bottom", fontsize=9, color="#374151")
            total = vc.sum()
            for bar, cnt in zip(bars, vc.values):
                if bar.get_height() > max(vc.values) * 0.12:
                    ax.text(bar.get_x() + bar.get_width() / 2,
                            bar.get_height() / 2,
                            f"{cnt/total*100:.1f}%",
                            ha="center", va="center", fontsize=9,
                            color="white", fontweight="bold")

        title_col = target_column if len(target_column) <= 30 else target_column[:27] + "…"
        ax.set_title(f"Target Distribution — {title_col}", fontsize=13,
                     fontweight="bold", pad=12, color="#111827")
        ax.tick_params(labelsize=10, colors="#374151")
        for spine in ax.spines.values():
            spine.set_edgecolor("#d1d5db")
        ax.yaxis.grid(True, color="#e5e7eb", linewidth=0.6, linestyle="--")
        ax.set_axisbelow(True)
        fig.tight_layout(pad=1.5)
        return _fig_to_b64(fig)
    except Exception:
        plt.close("all")
        return None


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_plots(
    df: Any,
    columns: list[dict[str, Any]],
    target_column: str | None = None,
) -> dict[str, Any]:
    """Generate all plots and return as a dict of base64 PNG strings."""
    result: dict[str, Any] = {}

    result["column_distributions"] = column_distribution_plots(df, columns)
    result["correlation_heatmap"] = correlation_heatmap(df)
    result["missing_values_chart"] = missing_values_chart(columns)

    if target_column:
        result["target_distribution"] = target_distribution_plot(df, target_column)
    else:
        result["target_distribution"] = None

    return result
