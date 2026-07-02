"""LangGraph model suggestion agent for DataFun MCP server.

5-node graph:
    classify_problem → assess_data → rank_models → generate_starter_code → flag_concerns

All LLM calls go through LiteLLM → OpenRouter using the openrouter/ prefix.
"""

from __future__ import annotations

import json
import re
from typing import Any, TypedDict

import litellm
from langgraph.graph import END, StateGraph

from core.config import settings

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _openrouter_model() -> str:
    """Return the LiteLLM model string with the openrouter/ prefix."""
    model = settings.litellm_default_model
    if not model.startswith("openrouter/"):
        model = f"openrouter/{model}"
    return model


def _llm_call(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
    """Call LiteLLM → OpenRouter and return the response text."""
    response = litellm.completion(
        model=_openrouter_model(),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        api_key=settings.openrouter_api_key,
        api_base="https://openrouter.ai/api/v1",
    )
    return response.choices[0].message.content or ""


def _extract_json(text: str) -> Any:
    """Extract JSON from an LLM response that may contain markdown fences."""
    # Try bare JSON first
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    # Strip markdown code fences
    match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Last-ditch: find first { ... } block
    match = re.search(r"(\{[\s\S]+\})", text)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON from LLM response:\n{text[:500]}")


# ─── State ────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    profile_result: dict[str, Any]
    task_type: str
    data_assessment: dict[str, Any]
    suggestions: list[dict[str, Any]]
    starter_code: str
    concerns: list[str]
    evaluation_metrics: list[str]
    preprocessing_steps: list[str]
    max_suggestions: int


# ─── Task type → candidate models ────────────────────────────────────────────

_TASK_CANDIDATES: dict[str, list[str]] = {
    "regression": [
        "XGBoost", "LightGBM", "Random Forest", "Decision Tree", "SVR", "Ridge", "Linear Regression",
    ],
    "binary_classification": [
        "XGBoost", "LightGBM", "Random Forest", "Logistic Regression", "Decision Tree", "SVM", "CatBoost",
    ],
    "multiclass_classification": [
        "XGBoost", "LightGBM", "Random Forest", "Logistic Regression", "Decision Tree", "SVM", "CatBoost",
    ],
    # ── COMING SOON ──────────────────────────────────────────────────────────
    # "clustering": [
    #     "K-Means", "DBSCAN", "Agglomerative Clustering", "Gaussian Mixture",
    # ],
    # "time_series": [
    #     "Prophet", "ARIMA", "LSTM", "LightGBM (lag features)",
    # ],
    # "anomaly_detection": [
    #     "Isolation Forest", "One-Class SVM", "Autoencoder",
    # ],
}

_TASK_METRICS: dict[str, list[str]] = {
    "regression": ["RMSE", "MAE", "R²"],
    "binary_classification": ["ROC-AUC", "F1-score", "Precision-Recall curve"],
    "multiclass_classification": ["Accuracy", "Macro F1-score", "Confusion Matrix"],
    # ── COMING SOON ──────────────────────────────────────────────────────────
    # "clustering": ["Silhouette Score", "Davies-Bouldin Index", "Calinski-Harabasz Score"],
    # "time_series": ["MAE", "RMSE", "MAPE"],
    # "anomaly_detection": ["Precision@K", "ROC-AUC", "F1-score"],
}


# ─── Node 1: classify_problem ────────────────────────────────────────────────

def classify_problem(state: AgentState) -> AgentState:
    """Determine the ML task type from the profile result."""
    profile = state["profile_result"]
    target_analysis = profile.get("target_analysis")

    if target_analysis is None:
        # No target column — time series and clustering are coming soon
        # has_datetime = any(c.get("type") == "datetime" for c in profile.get("columns", []))
        # task_type = "time_series" if has_datetime else "clustering"
        raise ValueError(
            "No target column set. Time series and clustering support is coming soon — "
            "please set a target column in the Profile step."
        )
    else:
        raw_task = target_analysis.get("task_type", "")
        # Only supervised tasks are supported right now
        if raw_task in ("regression", "binary_classification", "multiclass_classification"):
            task_type = raw_task
        # ── COMING SOON ──────────────────────────────────────────────────────
        # elif raw_task == "time_series":
        #     task_type = "time_series"
        # elif raw_task == "anomaly_detection":
        #     task_type = "anomaly_detection"
        # elif raw_task == "clustering":
        #     task_type = "clustering"
        else:
            raise ValueError(
                f"Task type '{raw_task}' is not supported yet. "
                "Supported types: regression, binary_classification, multiclass_classification. "
                "Time series, clustering, and anomaly detection are coming soon."
            )

    return {**state, "task_type": task_type}


# ─── Node 2: assess_data ─────────────────────────────────────────────────────

def assess_data(state: AgentState) -> AgentState:
    """Read dataset characteristics from the profile to inform model selection."""
    profile = state["profile_result"]
    target_analysis = profile.get("target_analysis") or {}
    columns = profile.get("columns", [])

    # High cardinality string columns
    high_cardinality = [
        c["name"]
        for c in columns
        if c.get("type") == "string" and c.get("unique_count", 0) > 20
    ]

    # Highly skewed numeric columns (features only — target handled separately)
    target_col_name = (profile.get("target_analysis") or {}).get("column")
    skewed_columns = [
        c["name"]
        for c in columns
        if c.get("skewness") is not None and abs(c["skewness"]) > 2
        and c["name"] != target_col_name
    ]

    # Target skewness (for regression — large skew means log-transform the target)
    target_col_stats = next((c for c in columns if c["name"] == target_col_name), None) if target_col_name else None
    target_skewness = target_col_stats.get("skewness") if target_col_stats else None

    # Columns with significant missing values
    missing_columns = [
        c["name"]
        for c in columns
        if c.get("missing_pct", 0) > 10
    ]

    # Max correlation (proxy for multicollinearity)
    correlations = profile.get("correlations", [])
    max_corr = max((abs(c["correlation"]) for c in correlations), default=0.0)

    assessment = {
        "num_rows": profile.get("num_rows", 0),
        "num_columns": profile.get("num_columns", 0),
        "missing_cells_pct": profile.get("missing_cells_pct", 0.0),
        "imbalance_ratio": target_analysis.get("imbalance_ratio"),
        "imbalance_severity": target_analysis.get("imbalance_severity"),
        "high_cardinality_columns": high_cardinality,
        "skewed_columns": skewed_columns,
        "missing_columns": missing_columns,
        "max_correlation": round(max_corr, 4),
        "is_small_dataset": profile.get("num_rows", 0) < 1000,
        "is_high_dimensional": profile.get("num_columns", 0) > 50,
        "target_skewness": target_skewness,
        "target_column": target_col_name,
    }

    return {**state, "data_assessment": assessment}


# ─── Node 3: rank_models ──────────────────────────────────────────────────────

def rank_models(state: AgentState) -> AgentState:
    """Call LiteLLM → OpenRouter to rank the best models for this dataset."""
    profile = state["profile_result"]
    assessment = state["data_assessment"]
    task_type = state["task_type"]
    max_n = state.get("max_suggestions", 5)

    candidates = _TASK_CANDIDATES.get(task_type, ["Random Forest", "XGBoost"])

    system_prompt = (
        "You are an expert ML engineer. Respond ONLY with valid JSON — no explanation, "
        "no markdown, no code fences. Return a JSON array of model suggestion objects."
    )

    user_prompt = f"""Dataset profile summary:
- Task type: {task_type}
- Rows: {assessment['num_rows']:,}
- Columns: {assessment['num_columns']}
- Missing cells: {assessment['missing_cells_pct']:.1f}%
- Imbalance ratio: {assessment.get('imbalance_ratio', 'N/A')}
- Imbalance severity: {assessment.get('imbalance_severity', 'N/A')}
- High cardinality columns: {assessment['high_cardinality_columns']}
- Skewed numeric columns: {assessment['skewed_columns']}
- Columns with >10% missing: {assessment['missing_columns']}
- Small dataset (<1000 rows): {assessment['is_small_dataset']}
- High dimensional (>50 cols): {assessment['is_high_dimensional']}
- Candidate algorithms: {candidates}

Return a JSON array with {min(max_n, len(candidates))} ranked model suggestions.
Each suggestion must have these exact fields:
{{
  "rank": <int>,
  "algorithm": "<algorithm name>",
  "framework": "<scikit-learn|xgboost|lightgbm|catboost|pytorch|statsmodels|sklearn>",
  "reason": "<1-2 sentences why this fits this specific dataset>",
  "strengths": ["<strength1>", "<strength2>", "<strength3>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "complexity": "<low|medium|high>",
  "training_speed": "<fast|medium|slow>",
  "suggested_params": {{<key: value pairs for key hyperparameters>}}
}}

Rank by suitability for this exact dataset. Be specific about why each model fits.
"""

    try:
        raw = _llm_call(system_prompt, user_prompt)
        suggestions = _extract_json(raw)
        if not isinstance(suggestions, list):
            raise ValueError("Expected a list of suggestions")
        # Ensure rank is set and all supervised models are trainable
        for i, s in enumerate(suggestions):
            s["rank"] = i + 1
            if task_type not in ("clustering", "anomaly_detection"):
                s["trainable"] = True
    except Exception:
        # Fallback: deterministic suggestions for common tasks
        suggestions = _fallback_suggestions(task_type, assessment, min(max_n, 3))

    return {**state, "suggestions": suggestions}


def _fallback_suggestions(
    task_type: str, assessment: dict[str, Any], n: int
) -> list[dict[str, Any]]:
    """Deterministic fallback suggestions when LLM call fails."""
    base: list[dict[str, Any]] = []

    if task_type in ("binary_classification", "multiclass_classification"):
        base = [
            {
                "rank": 1,
                "algorithm": "XGBoost",
                "framework": "xgboost",
                "reason": "Robust gradient boosting with native missing value handling.",
                "strengths": ["Handles missing values natively", "Built-in feature importance", "Fast training"],
                "weaknesses": ["Needs hyperparameter tuning", "Can overfit on small data"],
                "complexity": "medium",
                "training_speed": "fast",
                "suggested_params": {"n_estimators": 200, "max_depth": 6, "learning_rate": 0.1},
            },
            {
                "rank": 2,
                "algorithm": "LightGBM",
                "framework": "lightgbm",
                "reason": "Leaf-wise boosting — fast and memory efficient.",
                "strengths": ["Very fast training", "Low memory footprint", "Good with categoricals"],
                "weaknesses": ["Leaf-wise can overfit", "Less interpretable"],
                "complexity": "medium",
                "training_speed": "fast",
                "suggested_params": {"n_estimators": 200, "num_leaves": 31},
            },
            {
                "rank": 3,
                "algorithm": "Random Forest",
                "framework": "scikit-learn",
                "reason": "Ensemble baseline — robust, no scaling needed, strong feature importance.",
                "strengths": ["No feature scaling needed", "Feature importance", "Low variance"],
                "weaknesses": ["Slower than boosting on large data", "Memory intensive"],
                "complexity": "medium",
                "training_speed": "medium",
                "suggested_params": {"n_estimators": 200, "max_features": "sqrt"},
            },
            {
                "rank": 4,
                "algorithm": "Logistic Regression",
                "framework": "scikit-learn",
                "reason": "Strong linear baseline; fast, interpretable, and well-calibrated.",
                "strengths": ["Fast training", "Interpretable coefficients", "Well-calibrated probabilities"],
                "weaknesses": ["Assumes linear boundary", "Needs feature scaling"],
                "complexity": "low",
                "training_speed": "fast",
                "suggested_params": {"C": 1.0, "max_iter": 1000},
            },
            {
                "rank": 5,
                "algorithm": "Decision Tree",
                "framework": "scikit-learn",
                "reason": "Fully interpretable tree — good for understanding decision rules.",
                "strengths": ["Highly interpretable", "No scaling needed", "Handles non-linearity"],
                "weaknesses": ["Prone to overfitting", "High variance", "Fragile to small data changes"],
                "complexity": "low",
                "training_speed": "fast",
                "suggested_params": {"max_depth": 6, "min_samples_leaf": 10},
            },
            {
                "rank": 6,
                "algorithm": "SVM",
                "framework": "scikit-learn",
                "reason": "Effective in high-dimensional spaces; strong on small-to-medium datasets.",
                "strengths": ["Works well in high dimensions", "Memory efficient", "Versatile kernels"],
                "weaknesses": ["Slow on large datasets", "Needs feature scaling", "Hard to tune"],
                "complexity": "medium",
                "training_speed": "slow",
                "suggested_params": {"C": 1.0, "kernel": "rbf", "probability": True},
            },
        ]
    elif task_type == "regression":
        is_small = assessment.get("is_small_dataset", False)
        has_skewed = bool(assessment.get("skewed_columns"))
        base = [
            {
                "rank": 1,
                "algorithm": "XGBoost",
                "framework": "xgboost",
                "reason": (
                    "Gradient boosting with regularisation — top performer on tabular regression. "
                    + ("Log-transform skewed features before training." if has_skewed else "")
                ).strip(),
                "strengths": ["Handles missing values natively", "Built-in L1/L2 regularisation", "Feature importance"],
                "weaknesses": ["More hyperparameters than linear models", "Slower than LightGBM on large datasets"],
                "complexity": "medium",
                "training_speed": "fast",
                "suggested_params": {
                    "n_estimators": 200 if is_small else 500,
                    "max_depth": 4 if is_small else 5,
                    "learning_rate": 0.05,
                    "subsample": 0.8,
                    "colsample_bytree": 0.8,
                    "min_child_weight": 3 if is_small else 5,
                    "reg_alpha": 0.1,
                    "reg_lambda": 1.0,
                },
            },
            {
                "rank": 2,
                "algorithm": "LightGBM",
                "framework": "lightgbm",
                "reason": "Leaf-wise boosting — faster than XGBoost on large datasets with similar accuracy.",
                "strengths": ["Very fast training", "Low memory", "Good categorical handling"],
                "weaknesses": ["Leaf-wise growth can overfit on small data", "Less interpretable"],
                "complexity": "medium",
                "training_speed": "fast",
                "suggested_params": {
                    "n_estimators": 200 if is_small else 500,
                    "num_leaves": 20 if is_small else 31,
                    "learning_rate": 0.05,
                    "subsample": 0.8,
                    "colsample_bytree": 0.8,
                    "min_child_samples": 10 if is_small else 20,
                },
            },
            {
                "rank": 3,
                "algorithm": "Random Forest",
                "framework": "scikit-learn",
                "reason": "Ensemble of decision trees — robust baseline, no scaling needed.",
                "strengths": ["No hyperparameter sensitivity", "Feature importance", "Low variance"],
                "weaknesses": ["Slower than boosting on large data", "Memory intensive"],
                "complexity": "medium",
                "training_speed": "medium",
                "suggested_params": {"n_estimators": 300, "max_features": "sqrt", "min_samples_leaf": 4},
            },
            {
                "rank": 4,
                "algorithm": "Decision Tree",
                "framework": "scikit-learn",
                "reason": "Interpretable non-linear baseline — reveals key feature thresholds.",
                "strengths": ["Highly interpretable", "No scaling needed", "Captures non-linearity"],
                "weaknesses": ["High variance", "Prone to overfitting", "Fragile to data changes"],
                "complexity": "low",
                "training_speed": "fast",
                "suggested_params": {"max_depth": 6, "min_samples_leaf": 10},
            },
            {
                "rank": 5,
                "algorithm": "SVR",
                "framework": "scikit-learn",
                "reason": "Support vector regression — robust on small-to-medium datasets with outliers.",
                "strengths": ["Robust to outliers", "Effective in high dimensions", "Kernel flexibility"],
                "weaknesses": ["Slow on large datasets", "Needs feature scaling", "Hard to tune"],
                "complexity": "medium",
                "training_speed": "slow",
                "suggested_params": {"C": 1.0, "kernel": "rbf", "epsilon": 0.1},
            },
            {
                "rank": 6,
                "algorithm": "Ridge",
                "framework": "scikit-learn",
                "reason": "Fast linear baseline — use to benchmark non-linear gains.",
                "strengths": ["Extremely fast", "Interpretable coefficients", "L2 regularisation"],
                "weaknesses": ["Assumes linear relationship", "Sensitive to outliers"],
                "complexity": "low",
                "training_speed": "fast",
                "suggested_params": {"alpha": 10.0 if has_skewed else 1.0},
            },
        ]
    # ── COMING SOON ──────────────────────────────────────────────────────────
    # elif task_type == "time_series":
    #     base = [
    #         {"rank": 1, "algorithm": "LightGBM (lag features)", "framework": "lightgbm", ...},
    #         {"rank": 2, "algorithm": "XGBoost", "framework": "xgboost", ...},
    #         {"rank": 3, "algorithm": "Random Forest", "framework": "scikit-learn", ...},
    #     ]
    # elif task_type == "clustering":
    #     base = [
    #         {"rank": 1, "algorithm": "K-Means", "framework": "scikit-learn", ...},
    #         {"rank": 2, "algorithm": "DBSCAN", "framework": "scikit-learn", ...},
    #     ]
    # elif task_type == "anomaly_detection":
    #     base = [
    #         {"rank": 1, "algorithm": "Isolation Forest", "framework": "scikit-learn", ...},
    #         {"rank": 2, "algorithm": "One-Class SVM", "framework": "scikit-learn", ...},
    #     ]
    else:
        base = [
            {
                "rank": 1,
                "algorithm": "Random Forest",
                "framework": "scikit-learn",
                "reason": "Versatile ensemble suitable for many task types.",
                "strengths": ["Handles mixed types", "Feature importance", "Low variance"],
                "weaknesses": ["Slower training", "Less interpretable than linear models"],
                "complexity": "medium",
                "training_speed": "medium",
                "suggested_params": {"n_estimators": 200},
            },
        ]

    return base[:n]


# ─── Node 4: generate_starter_code ───────────────────────────────────────────

def generate_starter_code(state: AgentState) -> AgentState:
    """Generate a Python starter code snippet for the top-ranked model."""
    suggestions = state["suggestions"]
    task_type = state["task_type"]
    assessment = state["data_assessment"]

    if not suggestions:
        return {**state, "starter_code": "# No suggestions available."}

    top = suggestions[0]
    algorithm = top.get("algorithm", "XGBoost")
    framework = top.get("framework", "xgboost")
    params = top.get("suggested_params", {})

    system_prompt = (
        "You are a senior ML engineer. Generate clean, runnable Python code. "
        "Use only standard libraries and the specified framework. "
        "Include comments. Do NOT include markdown fences in your output."
    )

    user_prompt = f"""Generate a complete Python starter script for:
- Task: {task_type}
- Algorithm: {algorithm}
- Framework: {framework}
- Key parameters: {json.dumps(params, indent=2)}
- Dataset characteristics:
  - {assessment['num_rows']:,} rows, {assessment['num_columns']} columns
  - Missing cells: {assessment['missing_cells_pct']:.1f}%
  - Imbalance severity: {assessment.get('imbalance_severity', 'N/A')}
  - High cardinality columns: {assessment['high_cardinality_columns']}

Include:
1. Import statements
2. Data loading (assume df is already loaded as a pandas DataFrame)
3. Basic preprocessing (handle missing values, encode categoricals)
4. Train/test split
5. Model instantiation with suggested params
6. Training
7. Evaluation with appropriate metrics for {task_type}

Return ONLY the Python code, no explanation text, no markdown.
"""

    try:
        code = _llm_call(system_prompt, user_prompt, temperature=0.2)
        # Strip any accidental fences
        code = re.sub(r"```(?:python)?\s*", "", code)
        code = code.replace("```", "").strip()
    except Exception:
        code = _fallback_code(algorithm, framework, task_type, params, assessment)

    return {**state, "starter_code": code}


def _fallback_code(
    algorithm: str,
    framework: str,
    task_type: str,
    params: dict,
    assessment: dict,
) -> str:
    """Return a minimal but functional starter code snippet."""
    params_str = ", ".join(f"{k}={repr(v)}" for k, v in params.items())

    if framework == "xgboost":
        import_line = "import xgboost as xgb\nfrom xgboost import XGBClassifier, XGBRegressor"
        estimator = "XGBRegressor" if task_type == "regression" else "XGBClassifier"
        model_line = f"model = {estimator}({params_str})"
    elif framework == "lightgbm":
        import_line = "import lightgbm as lgb\nfrom lightgbm import LGBMClassifier, LGBMRegressor"
        estimator = "LGBMRegressor" if task_type == "regression" else "LGBMClassifier"
        model_line = f"model = {estimator}({params_str})"
    else:
        if task_type == "regression":
            import_line = "from sklearn.linear_model import Ridge"
            model_line = f"model = Ridge({params_str})"
        else:
            import_line = "from sklearn.linear_model import LogisticRegression"
            model_line = f"model = LogisticRegression({params_str})"

    metric_import = ""
    metric_code = ""
    if task_type == "regression":
        metric_import = "from sklearn.metrics import mean_squared_error, r2_score"
        metric_code = (
            "    mse = mean_squared_error(y_test, y_pred)\n"
            "    r2 = r2_score(y_test, y_pred)\n"
            '    print(f"RMSE: {mse ** 0.5:.4f}  R²: {r2:.4f}")'
        )
    else:
        metric_import = "from sklearn.metrics import classification_report, roc_auc_score"
        metric_code = (
            "    print(classification_report(y_test, y_pred))"
        )

    return f"""import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.impute import SimpleImputer
{import_line}
{metric_import}

# ── Assume df is your loaded DataFrame ──────────────────────────────────────
# df = pd.read_csv("your_dataset.csv")

TARGET_COLUMN = "target"  # <-- replace with your target column name

X = df.drop(columns=[TARGET_COLUMN])
y = df[TARGET_COLUMN]

# ── Basic preprocessing ──────────────────────────────────────────────────────
# Encode categorical columns
for col in X.select_dtypes(include=["object", "category"]).columns:
    X[col] = LabelEncoder().fit_transform(X[col].astype(str))

# Impute missing values
imputer = SimpleImputer(strategy="median")
X = pd.DataFrame(imputer.fit_transform(X), columns=X.columns)

# ── Train / test split ───────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# ── Model ────────────────────────────────────────────────────────────────────
{model_line}
model.fit(X_train, y_train)

# ── Evaluate ─────────────────────────────────────────────────────────────────
y_pred = model.predict(X_test)
{metric_code}
"""


# ─── Node 5: flag_concerns ────────────────────────────────────────────────────

def flag_concerns(state: AgentState) -> AgentState:
    """Produce dataset-specific concerns and derive evaluation metrics + preprocessing steps."""
    assessment = state["data_assessment"]
    task_type = state["task_type"]
    profile = state["profile_result"]
    target_analysis = profile.get("target_analysis") or {}

    concerns: list[str] = []

    # Small dataset
    if assessment["is_small_dataset"]:
        concerns.append(
            f"Small dataset ({assessment['num_rows']:,} rows) — prefer simple, regularised models "
            "to avoid overfitting."
        )

    # High dimensionality
    if assessment["is_high_dimensional"]:
        concerns.append(
            f"High dimensionality ({assessment['num_columns']} columns) — consider PCA or "
            "feature selection to reduce noise."
        )

    # Imbalance
    severity = assessment.get("imbalance_severity")
    ratio = assessment.get("imbalance_ratio")
    if severity in ("moderate", "severe") and ratio is not None:
        strategy = target_analysis.get("recommended_strategy", "SMOTE")
        concerns.append(
            f"Class imbalance ({ratio}:1, severity: {severity}) — apply {strategy} or use "
            "class_weight parameter."
        )

    # Missing values
    if assessment["missing_cells_pct"] > 10:
        concerns.append(
            f"{assessment['missing_cells_pct']:.1f}% missing values — impute before training."
        )

    # Leakage candidates
    leakage = target_analysis.get("leakage_candidates", [])
    for feat in leakage:
        concerns.append(
            f"Feature '{feat}' has very high correlation with target (>0.95) — "
            "investigate for data leakage before training."
        )

    # High cardinality
    for col in assessment["high_cardinality_columns"]:
        concerns.append(
            f"Column '{col}' is high-cardinality — use target/frequency encoding, not one-hot."
        )

    # Constant columns from recommendations
    for rec in profile.get("recommendations", []):
        if rec.get("category") == "constant":
            col_name = rec.get("message", "").split("'")[1] if "'" in rec.get("message", "") else "?"
            concerns.append(f"Constant column '{col_name}' — drop before training.")
            break  # one generic warning is enough

    # ── Evaluation metrics (deterministic from task_type) ─────────────────
    evaluation_metrics = _TASK_METRICS.get(task_type, ["Accuracy"])

    # ── Preprocessing steps (derived from profile) ────────────────────────
    preprocessing_steps: list[str] = []

    constant_cols = [c["name"] for c in profile.get("columns", []) if c.get("unique_count") == 1]
    if constant_cols:
        preprocessing_steps.append(f"Drop constant columns: {constant_cols}")

    for col in assessment["missing_columns"]:
        # Determine column type
        col_type = next(
            (c.get("type") for c in profile.get("columns", []) if c["name"] == col), "unknown"
        )
        strategy = "median" if col_type in ("integer", "float") else "mode"
        preprocessing_steps.append(f"Impute '{col}' with {strategy}")

    cat_cols = [
        c["name"]
        for c in profile.get("columns", [])
        if c.get("type") in ("string", "categorical")
    ]
    if cat_cols:
        preprocessing_steps.append(f"Encode categorical columns: {cat_cols}")

    if leakage:
        preprocessing_steps.append(f"Investigate / remove leakage candidates: {leakage}")

    if assessment["skewed_columns"] and task_type == "regression":
        preprocessing_steps.append(
            f"Log-transform skewed features (skewness > 2): {assessment['skewed_columns']}"
        )

    target_skewness = assessment.get("target_skewness")
    target_col = assessment.get("target_column")
    if task_type == "regression" and target_skewness is not None and abs(target_skewness) > 1:
        concerns.append(
            f"Target column '{target_col}' is skewed (skewness={target_skewness:.2f}). "
            "Log-transforming the target (log1p) before training can significantly reduce RMSE — "
            "remember to exponentiate predictions back (expm1) at inference time."
        )
        preprocessing_steps.append(
            f"Log-transform target '{target_col}': y = np.log1p(y) — improves RMSE for right-skewed targets"
        )

    return {
        **state,
        "concerns": concerns,
        "evaluation_metrics": evaluation_metrics,
        "preprocessing_steps": preprocessing_steps,
    }


# ─── Graph assembly ───────────────────────────────────────────────────────────

def _build_graph() -> Any:
    builder = StateGraph(AgentState)
    builder.add_node("classify_problem", classify_problem)
    builder.add_node("assess_data", assess_data)
    builder.add_node("rank_models", rank_models)
    builder.add_node("generate_starter_code", generate_starter_code)
    builder.add_node("flag_concerns", flag_concerns)

    builder.set_entry_point("classify_problem")
    builder.add_edge("classify_problem", "assess_data")
    builder.add_edge("assess_data", "rank_models")
    builder.add_edge("rank_models", "generate_starter_code")
    builder.add_edge("generate_starter_code", "flag_concerns")
    builder.add_edge("flag_concerns", END)

    return builder.compile()


_graph = _build_graph()


# ─── Public entry point ───────────────────────────────────────────────────────

def run_suggestion_agent(
    profile_result: dict[str, Any],
    max_suggestions: int = 5,
) -> dict[str, Any]:
    """Run the 5-node LangGraph suggestion agent.

    Args:
        profile_result: ProfileResult dict from the profiler.
        max_suggestions: Maximum number of model suggestions to return.

    Returns:
        SuggestionResult dict.
    """
    initial_state: AgentState = {
        "profile_result": profile_result,
        "task_type": "",
        "data_assessment": {},
        "suggestions": [],
        "starter_code": "",
        "concerns": [],
        "evaluation_metrics": [],
        "preprocessing_steps": [],
        "max_suggestions": max_suggestions,
    }

    final_state = _graph.invoke(initial_state)

    task_type = final_state["task_type"]
    suggestions = final_state["suggestions"][:max_suggestions]

    # Build human-readable problem summary
    assessment = final_state["data_assessment"]
    num_rows = assessment.get("num_rows", 0)
    num_cols = assessment.get("num_columns", 0)
    imb_severity = assessment.get("imbalance_severity")
    imb_ratio = assessment.get("imbalance_ratio")

    if imb_severity and imb_severity != "none" and imb_ratio is not None:
        problem_summary = (
            f"{task_type.replace('_', ' ').title()} with {num_rows:,} rows, "
            f"{imb_severity} imbalance ({imb_ratio}:1)"
        )
    else:
        problem_summary = f"{task_type.replace('_', ' ').title()} with {num_rows:,} rows, {num_cols} columns"

    return {
        "task_type": task_type,
        "problem_summary": problem_summary,
        "suggestions": suggestions,
        "starter_code": final_state["starter_code"],
        "concerns": final_state["concerns"],
        "evaluation_metrics": final_state["evaluation_metrics"],
        "preprocessing_steps": final_state["preprocessing_steps"],
    }
