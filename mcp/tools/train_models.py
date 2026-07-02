"""train_models MCP tool.

Trains one or more sklearn-compatible models on a dataset, returns per-model
metrics, matplotlib plots (confusion matrix / feature importance), and joblib-
serialised pipeline bytes.

All training runs in a thread pool (asyncio.to_thread) so the MCP event loop
stays responsive.
"""

from __future__ import annotations

import asyncio
import base64
import io
import tempfile
import time
from pathlib import Path
from typing import Any

import joblib
import matplotlib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    roc_curve,
    auc as sk_auc,
    silhouette_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler, label_binarize

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from core.format_loader import load_dataframe


# ── Model registry ────────────────────────────────────────────────────────────

def _get_estimator(model_key: str, task_type: str, n_classes: int = 2, n_samples: int = 1000):
    """Return an instantiated sklearn-compatible estimator."""
    from sklearn.ensemble import (
        GradientBoostingClassifier, GradientBoostingRegressor,
        IsolationForest, RandomForestClassifier, RandomForestRegressor,
    )
    from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge
    from sklearn.svm import SVC, SVR, OneClassSVM
    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
    from sklearn.cluster import DBSCAN, KMeans

    is_regression = task_type == "regression"
    is_clustering = task_type == "clustering"
    is_anomaly = task_type == "anomaly_detection"
    is_ts = task_type == "time_series"

    k = model_key.lower().replace(" ", "_").replace("-", "_")

    if k in ("logistic_regression", "softmax_regression"):
        return LogisticRegression(max_iter=1000, C=1.0)
    if k == "decision_tree":
        return DecisionTreeRegressor(max_depth=6, min_samples_leaf=10, random_state=42) if is_regression \
            else DecisionTreeClassifier(max_depth=6, min_samples_leaf=10, random_state=42)
    if k == "random_forest":
        return RandomForestRegressor(n_estimators=100, max_features="sqrt", random_state=42, n_jobs=-1) if is_regression \
            else RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    if k == "xgboost":
        from xgboost import XGBClassifier, XGBRegressor
        return XGBRegressor(
            n_estimators=500, max_depth=5, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
            reg_alpha=0.1, reg_lambda=1.0, random_state=42, verbosity=0,
        ) if is_regression \
            else XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.1,
                               random_state=42, verbosity=0,
                               use_label_encoder=False, eval_metric="logloss")
    if k in ("lightgbm", "lightgbm_(lag_features)"):
        from lightgbm import LGBMClassifier, LGBMRegressor
        return LGBMRegressor(
            n_estimators=500, num_leaves=31, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, min_child_samples=20,
            random_state=42, verbose=-1,
        ) if (is_regression or is_ts) \
            else LGBMClassifier(n_estimators=200, random_state=42, verbose=-1)
    if k == "gradient_boosting":
        return GradientBoostingRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.05,
            subsample=0.8, random_state=42,
        ) if is_regression \
            else GradientBoostingClassifier(n_estimators=200, random_state=42)
    if k == "svm":
        return SVR() if is_regression else SVC(probability=True, random_state=42)
    if k == "svr":
        return SVR()
    if k in ("ridge", "ridge_regression"):
        return Ridge(alpha=1.0)
    if k == "linear_regression":
        return LinearRegression()
    # ── COMING SOON ──────────────────────────────────────────────────────────
    # if k == "kmeans":
    #     return KMeans(n_clusters=min(8, max(2, n_samples // 50)), random_state=42, n_init="auto")
    # if k == "dbscan":
    #     return DBSCAN(eps=0.5, min_samples=5)
    # if k in ("isolation_forest",):
    #     return IsolationForest(random_state=42, contamination=0.1)
    # if k in ("one_class_svm", "one-class_svm"):
    #     return OneClassSVM(nu=0.1)
    if k == "catboost":
        try:
            from catboost import CatBoostClassifier, CatBoostRegressor
            return CatBoostRegressor(iterations=100, random_seed=42, verbose=0) if is_regression \
                else CatBoostClassifier(iterations=100, random_seed=42, verbose=0)
        except ImportError:
            return RandomForestRegressor(n_estimators=100, random_state=42) if is_regression \
                else RandomForestClassifier(n_estimators=100, random_state=42)

    raise ValueError(f"Unknown model key: {model_key!r}")


# ── Plot helpers ──────────────────────────────────────────────────────────────

def _png_to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def _confusion_matrix_plot(cm: np.ndarray, labels: list[str]) -> str:
    n = len(labels)
    size = max(4, min(10, n * 1.2))
    fig, ax = plt.subplots(figsize=(size, size * 0.85))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    im = ax.imshow(cm, cmap="YlOrRd", aspect="auto")
    ax.set_xticks(range(n)); ax.set_xticklabels(labels, rotation=45, ha="right", color="#111827", fontsize=9)
    ax.set_yticks(range(n)); ax.set_yticklabels(labels, color="#111827", fontsize=9)
    ax.set_xlabel("Predicted", color="#374151"); ax.set_ylabel("Actual", color="#374151")
    ax.tick_params(colors="#374151")
    for spine in ax.spines.values():
        spine.set_edgecolor("#d1d5db")

    thresh = cm.max() / 2
    for i in range(n):
        for j in range(n):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                    color="#111827" if cm[i, j] < thresh else "white", fontsize=9 if n <= 6 else 7)

    cb = fig.colorbar(im, ax=ax)
    cb.ax.yaxis.set_tick_params(color="#374151")
    plt.setp(cb.ax.yaxis.get_ticklabels(), color="#374151")
    fig.tight_layout()
    return _png_to_b64(fig)


def _feature_importance_plot(names: list[str], importances: np.ndarray, top_n: int = 20) -> str:
    indices = np.argsort(importances)[::-1][:top_n]
    top_names = [names[i] for i in indices]
    top_vals = importances[indices]

    fig, ax = plt.subplots(figsize=(7, max(3, len(top_names) * 0.35)))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")
    bars = ax.barh(top_names[::-1], top_vals[::-1], color="#6366f1")
    ax.tick_params(colors="#374151", labelsize=8)
    ax.set_xlabel("Importance", color="#374151")
    for spine in ax.spines.values():
        spine.set_edgecolor("#d1d5db")
    fig.tight_layout()
    return _png_to_b64(fig)


def _regression_scatter_plot(y_true, y_pred) -> str:
    fig, ax = plt.subplots(figsize=(5, 4))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")
    ax.scatter(y_true, y_pred, alpha=0.5, color="#6366f1", s=15)
    mn, mx = min(y_true.min(), y_pred.min()), max(y_true.max(), y_pred.max())
    ax.plot([mn, mx], [mn, mx], color="#ef4444", linewidth=1.5, linestyle="--")
    ax.set_xlabel("Actual", color="#374151"); ax.set_ylabel("Predicted", color="#374151")
    ax.tick_params(colors="#374151")
    for spine in ax.spines.values():
        spine.set_edgecolor("#d1d5db")
    fig.tight_layout()
    return _png_to_b64(fig)


def _roc_curve_plot(y_test, y_score: np.ndarray, target_classes: list[str]) -> str:
    fig, ax = plt.subplots(figsize=(5, 4))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    if len(target_classes) <= 2:
        fpr, tpr, _ = roc_curve(y_test, y_score[:, 1] if y_score.ndim > 1 else y_score)
        roc_auc = sk_auc(fpr, tpr)
        ax.plot(fpr, tpr, color="#6366f1", linewidth=2, label=f"AUC = {roc_auc:.3f}")
    else:
        palette = ["#6366f1", "#f97316", "#22c55e", "#ec4899", "#f59e0b"]
        classes = list(range(len(target_classes)))
        y_bin = label_binarize(y_test, classes=classes)
        for i, cls_name in enumerate(target_classes[:5]):
            fpr, tpr, _ = roc_curve(y_bin[:, i], y_score[:, i])
            roc_auc = sk_auc(fpr, tpr)
            ax.plot(fpr, tpr, color=palette[i % len(palette)],
                    linewidth=1.5, label=f"{cls_name} ({roc_auc:.2f})")

    ax.plot([0, 1], [0, 1], color="#9ca3af", linestyle="--", linewidth=1)
    ax.set_xlabel("False Positive Rate", color="#374151")
    ax.set_ylabel("True Positive Rate", color="#374151")
    ax.tick_params(colors="#374151")
    ax.legend(facecolor="white", edgecolor="#d1d5db", labelcolor="#111827", fontsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor("#d1d5db")
    fig.tight_layout()
    return _png_to_b64(fig)


def _residual_plot(y_true, y_pred) -> str:
    residuals = np.array(y_pred, dtype=float) - np.array(y_true, dtype=float)
    fig, ax = plt.subplots(figsize=(5, 4))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")
    ax.scatter(y_pred, residuals, alpha=0.5, color="#6366f1", s=15)
    ax.axhline(0, color="#ef4444", linewidth=1.5, linestyle="--")
    ax.set_xlabel("Predicted", color="#374151")
    ax.set_ylabel("Residual (Predicted − Actual)", color="#374151")
    ax.tick_params(colors="#374151")
    for spine in ax.spines.values():
        spine.set_edgecolor("#d1d5db")
    fig.tight_layout()
    return _png_to_b64(fig)


def _ts_actual_vs_predicted_plot(y_true, y_pred) -> str:
    fig, ax = plt.subplots(figsize=(7, 4))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")
    idx = range(len(y_true))
    ax.plot(idx, y_true, color="#6366f1", linewidth=1.5, label="Actual")
    ax.plot(idx, y_pred, color="#f97316", linewidth=1.5, linestyle="--", label="Predicted")
    ax.set_xlabel("Test Sample Index", color="#374151")
    ax.set_ylabel("Value", color="#374151")
    ax.tick_params(colors="#374151")
    ax.legend(facecolor="white", edgecolor="#d1d5db", labelcolor="#111827")
    for spine in ax.spines.values():
        spine.set_edgecolor("#d1d5db")
    fig.tight_layout()
    return _png_to_b64(fig)


def _learning_curve_plot(train_scores: list[float], val_scores: list[float], metric_name: str) -> str:
    fig, ax = plt.subplots(figsize=(6, 4))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")
    iters = range(1, len(train_scores) + 1)
    ax.plot(iters, train_scores, color="#6366f1", linestyle="--", linewidth=1.5, label="Train")
    ax.plot(iters, val_scores, color="#f97316", linewidth=1.5, label="Val")
    ax.set_xlabel("Iteration", color="#374151")
    ax.set_ylabel(metric_name.upper(), color="#374151")
    ax.tick_params(colors="#374151")
    ax.legend(facecolor="white", edgecolor="#d1d5db", labelcolor="#111827")
    for spine in ax.spines.values():
        spine.set_edgecolor("#d1d5db")
    fig.tight_layout()
    return _png_to_b64(fig)


def _get_learning_curve_data(
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    preprocessor,
    model_key: str,
    task_type: str,
) -> tuple[list[float], list[float], str] | None:
    """Return (train_scores, val_scores, metric_name) for boosting models, else None.

    preprocessor must already be fitted. Trains a SEPARATE estimator for the
    curve — does not affect the main pipeline.
    """
    k = model_key.lower().replace(" ", "_").replace("-", "_")
    supported = {"xgboost", "lightgbm", "lightgbm_(lag_features)", "gradient_boosting"}
    if k not in supported:
        return None

    is_regression = task_type in ("regression", "time_series")

    try:
        X_t = preprocessor.transform(X_train)
        X_tr, X_val, y_tr, y_val = train_test_split(X_t, y_train, test_size=0.2, random_state=0)

        if k == "xgboost":
            from xgboost import XGBClassifier, XGBRegressor
            eval_metric = "rmse" if is_regression else "logloss"
            mdl = (XGBRegressor(n_estimators=500, max_depth=5, learning_rate=0.05,
                                subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
                                reg_alpha=0.1, reg_lambda=1.0,
                                random_state=42, verbosity=0, eval_metric=eval_metric)
                   if is_regression
                   else XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.1,
                                      random_state=42, verbosity=0,
                                      use_label_encoder=False, eval_metric=eval_metric))
            mdl.fit(X_tr, y_tr,
                    eval_set=[(X_tr, y_tr), (X_val, y_val)],
                    verbose=False)
            evals = mdl.evals_result()
            sets = list(evals.keys())
            metric_key = list(evals[sets[0]].keys())[0]
            return (evals[sets[0]][metric_key],
                    evals[sets[1]][metric_key],
                    metric_key)

        if k in ("lightgbm", "lightgbm_(lag_features)"):
            import lightgbm as lgb
            from lightgbm import LGBMClassifier, LGBMRegressor
            mdl = (LGBMRegressor(n_estimators=500, num_leaves=31, learning_rate=0.05,
                                 subsample=0.8, colsample_bytree=0.8, min_child_samples=20,
                                 random_state=42, verbose=-1)
                   if is_regression
                   else LGBMClassifier(n_estimators=200, random_state=42, verbose=-1))
            mdl.fit(X_tr, y_tr,
                    eval_set=[(X_tr, y_tr), (X_val, y_val)],
                    callbacks=[lgb.log_evaluation(period=-1)])
            evals = mdl.evals_result_
            sets = list(evals.keys())
            metric_key = list(evals[sets[0]].keys())[0]
            return (evals[sets[0]][metric_key],
                    evals[sets[1]][metric_key],
                    metric_key)

        if k == "gradient_boosting":
            from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
            from sklearn.metrics import log_loss
            mdl = (GradientBoostingRegressor(n_estimators=100, random_state=42)
                   if is_regression
                   else GradientBoostingClassifier(n_estimators=100, random_state=42))
            mdl.fit(X_tr, y_tr)
            if is_regression:
                train_s = [float(mean_squared_error(y_tr, p) ** 0.5)
                           for p in mdl.staged_predict(X_tr)]
                val_s = [float(mean_squared_error(y_val, p) ** 0.5)
                         for p in mdl.staged_predict(X_val)]
                return train_s, val_s, "rmse"
            else:
                train_s = [float(log_loss(y_tr, p)) for p in mdl.staged_predict_proba(X_tr)]
                val_s = [float(log_loss(y_val, p)) for p in mdl.staged_predict_proba(X_val)]
                return train_s, val_s, "logloss"

    except Exception:
        return None


# ── Core training logic ───────────────────────────────────────────────────────

def _train_one(
    df: pd.DataFrame,
    target_column: str | None,
    model_key: str,
    task_type: str,
    already_scaled: bool = False,
) -> dict[str, Any]:
    """Train a single model synchronously. Called via asyncio.to_thread."""
    t0 = time.perf_counter()

    # ── COMING SOON: block unsupported task types ────────────────────────────
    if task_type in ("clustering", "anomaly_detection", "time_series"):
        raise ValueError(
            f"Task type '{task_type}' is not supported yet. "
            "Clustering, anomaly detection, and time series training are coming soon."
        )

    is_supervised = task_type not in ("clustering", "anomaly_detection")
    is_regression = task_type == "regression"
    is_classification = task_type in ("binary_classification", "multiclass_classification")
    is_time_series = task_type == "time_series"
    is_clustering = task_type == "clustering"
    is_anomaly = task_type == "anomaly_detection"

    # ── Separate features / target ────────────────────────────────────────────
    # Auto-detect target if not explicitly provided (handles legacy profiles)
    if is_supervised and (not target_column or target_column not in df.columns):
        from core.profiler import _auto_detect_target
        target_column = _auto_detect_target(df)

    if is_supervised and not target_column:
        raise ValueError(
            "No target column found. Please confirm a target column in the Profile step before training."
        )

    if is_supervised and target_column and target_column in df.columns:
        X = df.drop(columns=[target_column])
        y_raw = df[target_column].copy()
    else:
        X = df.copy()
        y_raw = None

    # ── DateTime feature extraction (convert datetime cols → ordinal numerics) ──
    _dt_col_names = [c for c in X.columns if pd.api.types.is_datetime64_any_dtype(X[c])]
    for _col in list(X.columns):
        if _col not in _dt_col_names and X[_col].dtype == object:
            try:
                _parsed = pd.to_datetime(X[_col], infer_datetime_format=True, errors="coerce")
                if _parsed.notna().mean() > 0.8:
                    X[_col] = _parsed
                    _dt_col_names.append(_col)
            except Exception:
                pass
    for _col in _dt_col_names:
        try:
            _dt = pd.to_datetime(X[_col], errors="coerce")
            X[f"__dt_year_{_col}"] = _dt.dt.year.astype("float32").fillna(0)
            X[f"__dt_month_{_col}"] = _dt.dt.month.astype("float32").fillna(0)
            X[f"__dt_day_{_col}"] = _dt.dt.day.astype("float32").fillna(0)
            X[f"__dt_dow_{_col}"] = _dt.dt.dayofweek.astype("float32").fillna(0)
            X[f"__dt_doy_{_col}"] = _dt.dt.dayofyear.astype("float32").fillna(0)
        except Exception:
            pass
        X = X.drop(columns=[_col])

    # ── COMING SOON: lag feature generation for time series ──────────────────
    # if is_time_series and y_raw is not None:
    #     _y_num = pd.to_numeric(y_raw, errors="coerce")
    #     _med = float(_y_num.median()) if _y_num.notna().any() else 0.0
    #     _y_num = _y_num.fillna(_med)
    #     for _lag in [1, 2, 3, 7]:
    #         X[f"__lag_{_lag}"] = _y_num.shift(_lag).fillna(_med)
    #     X["__roll7_mean"] = _y_num.rolling(7, min_periods=1).mean().shift(1).fillna(_med)

    # ── Identify column types for ColumnTransformer ───────────────────────────
    num_cols = X.select_dtypes(include="number").columns.tolist()
    cat_cols = X.select_dtypes(include=["object", "category"]).columns.tolist()

    # If data was already scaled in the preprocess step, skip StandardScaler
    num_steps = [("imputer", SimpleImputer(strategy="median"))]
    if not already_scaled:
        num_steps.append(("scaler", StandardScaler()))
    num_pipe = Pipeline(num_steps)
    cat_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    transformers = []
    if num_cols: transformers.append(("num", num_pipe, num_cols))
    if cat_cols: transformers.append(("cat", cat_pipe, cat_cols))

    if not transformers:
        transformers = [("passthrough", "passthrough", X.columns.tolist())]

    preprocessor = ColumnTransformer(transformers, remainder="drop")

    # ── Encode target for classification ─────────────────────────────────────
    le = None
    target_classes: list[str] = []
    y = None

    if y_raw is not None:
        if is_regression or is_time_series:
            y = pd.to_numeric(y_raw, errors="coerce").fillna(y_raw.median() if not y_raw.empty else 0)
        else:
            le = LabelEncoder()
            y = le.fit_transform(y_raw.astype(str))
            target_classes = list(le.classes_)

    # ── Build pipeline + split ────────────────────────────────────────────────
    n_samples = len(X)
    estimator = _get_estimator(model_key, task_type, n_classes=len(target_classes) or 2, n_samples=n_samples)
    pipeline = Pipeline([("prep", preprocessor), ("model", estimator)])

    metrics: dict[str, Any] = {}
    confusion_matrix_png: str | None = None
    feature_importance_png: str | None = None
    roc_curve_png: str | None = None
    residual_plot_png: str | None = None
    ts_actual_vs_predicted_png: str | None = None
    learning_curve_png: str | None = None
    classification_report_text: str | None = None
    test_rows: list[dict] | None = None

    if is_supervised and y is not None:
        if is_time_series:
            split_idx = int(len(X) * 0.8)
            X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
            y_train, y_test = y[:split_idx], y[split_idx:]
        else:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42,
                stratify=y if not is_regression else None,
            )
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)

        # Capture up to 50 test rows with actual target for inference table
        if target_column:
            try:
                test_sample = X_test.iloc[:50].copy()
                if is_time_series:
                    actual_vals = y_raw.iloc[list(range(split_idx, min(split_idx + 50, len(y_raw))))].values
                else:
                    actual_vals = y_raw.loc[X_test.index[:50]].values
                test_sample["__target__"] = actual_vals
                test_rows = (test_sample
                             .where(pd.notna(test_sample), other=None)
                             .to_dict(orient="records"))
            except Exception:
                test_rows = None

        if is_regression or is_time_series:
            mse_val = float(mean_squared_error(y_test, y_pred))
            rmse = mse_val ** 0.5
            metrics = {
                "rmse": round(rmse, 4),
                "mse": round(mse_val, 4),
                "mae": round(float(mean_absolute_error(y_test, y_pred)), 4),
                "r2": round(float(r2_score(y_test, y_pred)), 4),
            }
            try:
                y_t = np.array(y_test, dtype=float)
                y_p = np.array(y_pred, dtype=float)
                feature_importance_png = _regression_scatter_plot(y_t, y_p)
                residual_plot_png = _residual_plot(y_t, y_p)
                if is_time_series:
                    ts_actual_vs_predicted_png = _ts_actual_vs_predicted_plot(y_t, y_p)
            except Exception:
                pass
        else:
            avg = "binary" if len(target_classes) <= 2 else "macro"
            labels = target_classes if target_classes else [str(c) for c in sorted(set(y_test))]
            metrics = {
                "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
                "precision": round(float(precision_score(y_test, y_pred, average=avg, zero_division=0)), 4),
                "recall": round(float(recall_score(y_test, y_pred, average=avg, zero_division=0)), 4),
                "f1": round(float(f1_score(y_test, y_pred, average=avg, zero_division=0)), 4),
            }
            # Classification report — always
            try:
                classification_report_text = classification_report(
                    y_test, y_pred, target_names=labels, zero_division=0
                )
            except Exception:
                pass
            # Confusion matrix — always
            try:
                cm = confusion_matrix(y_test, y_pred)
                confusion_matrix_png = _confusion_matrix_plot(cm, labels)
            except Exception:
                pass
            # AUC + ROC — only when model exposes predict_proba
            try:
                if hasattr(pipeline, "predict_proba"):
                    y_score = pipeline.predict_proba(X_test)
                    if len(target_classes) <= 2:
                        auc_val = float(roc_auc_score(y_test, y_score[:, 1]))
                    else:
                        auc_val = float(roc_auc_score(
                            y_test, y_score, multi_class="ovr", average="macro"
                        ))
                    metrics["auc"] = round(auc_val, 4)
                    roc_curve_png = _roc_curve_plot(y_test, y_score, target_classes)
            except Exception:
                pass

    # ── COMING SOON ──────────────────────────────────────────────────────────
    # elif is_clustering:
    #     pipeline.fit(X)
    #     X_transformed = preprocessor.fit_transform(X)
    #     labels = pipeline.named_steps["model"].labels_ if hasattr(pipeline.named_steps["model"], "labels_") \
    #         else pipeline.predict(X)
    #     n_unique = len(set(labels)) - (1 if -1 in set(labels) else 0)
    #     try:
    #         sil = float(silhouette_score(X_transformed, labels)) if n_unique > 1 else 0.0
    #     except Exception:
    #         sil = 0.0
    #     metrics = {"n_clusters": n_unique, "silhouette_score": round(sil, 4)}
    # elif is_anomaly:
    #     pipeline.fit(X)
    #     preds = pipeline.predict(X)
    #     n_anomalies = int((preds == -1).sum())
    #     metrics = {"n_anomalies": n_anomalies, "anomaly_pct": round(n_anomalies / len(X) * 100, 2)}

    # ── Feature importance ────────────────────────────────────────────────────
    if feature_importance_png is None:
        try:
            mdl = pipeline.named_steps["model"]
            importances = None
            if hasattr(mdl, "feature_importances_"):
                importances = mdl.feature_importances_
            elif hasattr(mdl, "coef_"):
                coefs = mdl.coef_
                importances = np.abs(coefs.ravel() if coefs.ndim > 1 else coefs)

            if importances is not None:
                # Get feature names after ColumnTransformer
                feat_names: list[str] = []
                for name, trans, cols in preprocessor.transformers_:
                    if name == "num":
                        feat_names.extend(cols)
                    elif name == "cat":
                        enc = trans.named_steps.get("encoder")
                        if enc and hasattr(enc, "get_feature_names_out"):
                            feat_names.extend(enc.get_feature_names_out(cols).tolist())
                        else:
                            feat_names.extend(cols)
                    else:
                        feat_names.extend(cols if isinstance(cols, list) else list(cols))

                if len(feat_names) == len(importances):
                    feature_importance_png = _feature_importance_plot(feat_names, importances)
        except Exception:
            pass

    # ── Learning curve (boosting models only) ────────────────────────────────
    if is_supervised and y is not None:
        try:
            lc = _get_learning_curve_data(
                X_train, y_train, preprocessor, model_key, task_type
            )
            if lc is not None:
                train_s, val_s, metric_name = lc
                learning_curve_png = _learning_curve_plot(train_s, val_s, metric_name)
        except Exception:
            pass

    # ── Serialise pipeline ────────────────────────────────────────────────────
    buf = io.BytesIO()
    joblib.dump({"pipeline": pipeline, "label_encoder": le, "target_classes": target_classes}, buf)
    model_bytes = base64.b64encode(buf.getvalue()).decode()

    training_time_s = round(time.perf_counter() - t0, 3)

    # Final feature names (raw, before preprocessing)
    feature_names = X.columns.tolist()

    return {
        "model_name": model_key,
        "task_type": task_type,
        "metrics": metrics,
        "target_classes": target_classes,
        "feature_names": feature_names,
        "confusion_matrix_png": confusion_matrix_png,
        "feature_importance_png": feature_importance_png,
        "roc_curve_png": roc_curve_png,
        "residual_plot_png": residual_plot_png,
        "ts_actual_vs_predicted_png": ts_actual_vs_predicted_png,
        "learning_curve_png": learning_curve_png,
        "classification_report_text": classification_report_text,
        "test_rows": test_rows,
        "target_column": target_column,
        "model_bytes": model_bytes,
        "training_time_s": training_time_s,
    }


# ── MCP Tool entrypoint ───────────────────────────────────────────────────────

async def train_models(
    file_bytes: str,
    filename: str,
    model_names: list[str],
    task_type: str,
    target_column: str | None = None,
    already_scaled: bool = False,
    feature_columns: list[str] | None = None,
) -> dict[str, Any]:
    """Train one or more ML models on a dataset.

    Args:
        file_bytes:      Base64-encoded raw file content.
        filename:        Original filename for format detection.
        model_names:     List of model keys to train.
        task_type:       Task type string from suggest_models.
        target_column:   Target column name (required for supervised tasks).
        already_scaled:  If True, skip StandardScaler in the internal ColumnTransformer
                         (data was already scaled in the preprocess step).
        feature_columns: Whitelist of column names to use as features. Any other
                         columns in the CSV (spurious, metadata, etc.) are dropped.
    """
    raw = base64.b64decode(file_bytes)
    suffix = Path(filename).suffix or ".csv"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = Path(tmp.name)
    df = load_dataframe(tmp_path)
    tmp_path.unlink(missing_ok=True)

    # Drop columns not in the known feature whitelist (removes spurious/metadata cols)
    if feature_columns:
        keep = set(feature_columns)
        if target_column:
            keep.add(target_column)
        drop_cols = [c for c in df.columns if c not in keep]
        if drop_cols:
            df = df.drop(columns=drop_cols)

    async def _train_async(model_key: str) -> dict[str, Any]:
        try:
            return await asyncio.to_thread(_train_one, df.copy(), target_column, model_key, task_type, already_scaled)
        except Exception as exc:
            return {
                "model_name": model_key,
                "task_type": task_type,
                "metrics": {},
                "target_classes": [],
                "feature_names": [],
                "confusion_matrix_png": None,
                "feature_importance_png": None,
                "roc_curve_png": None,
                "residual_plot_png": None,
                "ts_actual_vs_predicted_png": None,
                "learning_curve_png": None,
                "classification_report_text": None,
                "test_rows": None,
                "target_column": target_column,
                "model_bytes": "",
                "training_time_s": 0.0,
                "error": str(exc),
            }

    tasks = [_train_async(m) for m in model_names]
    results = await asyncio.gather(*tasks)

    return {"results": list(results)}
