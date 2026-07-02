# DataFun — Full Database Journey
### Real example: Esfer Sami uploads `iris.csv` and trains models

---

## Overview

Every action a user takes in DataFun writes to the database in a clear sequence.
The diagram below shows exactly which tables are written, when, and how they link together.

```
STEP 0 — Sign Up
    │
    ▼
┌─────────────────────────────────────────────────┐
│  TABLE: users                                   │
│                                                 │
│  id          → a1b2c3d4-...  (UUID, PK)         │
│  email       → esfer@example.com                │
│  full_name   → Esfer Sami                       │
│  password_hash → $2b$12$...  (bcrypt, never raw)│
│  created_at  → 2026-06-23 10:00:00 UTC          │
└─────────────────────────────────────────────────┘
    │
    │  user_id = a1b2c3d4-...
    ▼
STEP 1 — Upload & Profile iris.csv
    │
    ▼
┌─────────────────────────────────────────────────┐
│  TABLE: profiles                                │
│                                                 │
│  id          → e5f6a7b8-...  (UUID, PK)         │
│  user_id     → a1b2c3d4-...  (FK → users.id)   │
│  file_name   → iris.csv                         │
│  file_hash   → 9d3f2a...     (SHA of file)      │
│  file_format → csv                              │
│  file_size   → 4608  (bytes)                    │
│  num_rows    → 150                              │
│  num_columns → 5                                │
│  result      → { columns: [...],               │
│                  quality_score: { overall: 100, │
│                    grade: "A",                  │
│                    completeness: 100,           │
│                    uniqueness: 100,             │
│                    consistency: 100,            │
│                    validity: 100 },             │
│                  target_analysis: {             │
│                    column: "species",           │
│                    task_type: "multiclass_      │
│                               classification",  │
│                    num_classes: 3 },            │
│                  recommendations: [],           │
│                  correlations: [...] }  (JSON)  │
│  raw_data    → <binary CSV bytes>               │
│  preprocessing_ops  → null  (not yet)           │
│  preprocessed_result → null  (not yet)          │
│  created_at  → 2026-06-23 10:01:00 UTC          │
└─────────────────────────────────────────────────┘
    │
    │  ┌─────────── also written at same time ────────────┐
    │  │                                                   │
    │  ▼                                                   │
    │  ┌──────────────────────────────────────────────────┐│
    │  │  TABLE: profile_embeddings  (pgvector)           ││
    │  │                                                  ││
    │  │  id        → e5f6a7b8-...  (PK + FK → profiles) ││
    │  │  embedding → [ 0.0231, -0.1847, 0.0093, ... ]   ││
    │  │              1536-dimensional float vector       ││
    │  │              generated from the profile summary  ││
    │  │              text via LiteLLM embedding model    ││
    │  │                                                  ││
    │  │  PURPOSE: lets DataFun find similar past         ││
    │  │  datasets using cosine similarity search         ││
    │  └──────────────────────────────────────────────────┘│
    │  └───────────────────────────────────────────────────┘
    │
    │  user_id  = a1b2c3d4-...
    │  profile_id = e5f6a7b8-...
    ▼
STEP 2 — Preprocess (e.g. drop duplicates, encode)
    │
    │  profiles table is UPDATED (same row, no new row):
    │  preprocessing_ops → { operations: [...],
    │                         ops_applied: ["drop_duplicates"],
    │                         shape_before: [150, 5],
    │                         shape_after:  [147, 5] }
    │  raw_data          → <new preprocessed CSV bytes>
    │  num_rows          → 147  (updated)
    │  result            → updated stats after re-profile
    │
    ▼
STEP 3 — Re-profile
    │
    │  profiles.result updated again with fresh stats
    │  reflecting the cleaned dataset
    │
    ▼
STEP 4 — Suggest Models
    │
    ▼
┌─────────────────────────────────────────────────┐
│  TABLE: suggestions                             │
│                                                 │
│  id         → c9d0e1f2-...  (UUID, PK)          │
│  profile_id → e5f6a7b8-...  (FK → profiles.id) │
│  user_id    → a1b2c3d4-...  (FK → users.id)    │
│  task_type  → multiclass_classification         │
│  result     → { suggestions: [                 │
│                  { rank: 1,                     │
│                    algorithm: "XGBoost",        │
│                    reason: "...",               │
│                    strengths: [...],            │
│                    weaknesses: [...],           │
│                    complexity: "medium",        │
│                    training_speed: "fast" },    │
│                  { rank: 2,                     │
│                    algorithm: "Random Forest" },│
│                  { rank: 3,                     │
│                    algorithm: "LightGBM" } ],   │
│                 concerns: [...],                │
│                 evaluation_metrics: [...],      │
│                 starter_code: "import ..." }    │
│  created_at → 2026-06-23 10:03:00 UTC           │
└─────────────────────────────────────────────────┘
    │
    │  user_id    = a1b2c3d4-...
    │  profile_id = e5f6a7b8-...
    ▼
STEP 5 — Train Models (e.g. XGBoost + Random Forest selected)
    │
    │  One new row inserted per trained model
    │
    ▼
┌─────────────────────────────────────────────────┐
│  TABLE: trained_models  (row 1 — XGBoost)       │
│                                                 │
│  id           → f3a4b5c6-...  (UUID, PK)        │
│  profile_id   → e5f6a7b8-...  (FK → profiles)  │
│  user_id      → a1b2c3d4-...  (FK → users)     │
│  model_name   → xgboost                         │
│  task_type    → multiclass_classification       │
│  target_column → species                        │
│  target_classes → ["setosa","versicolor",       │
│                    "virginica"]                 │
│  feature_names → ["sepal_length","sepal_width", │
│                   "petal_length","petal_width"] │
│  metrics      → { accuracy: 0.9667,             │
│                   precision: 0.9672,            │
│                   recall: 0.9667,               │
│                   f1: 0.9666,                   │
│                   auc: 0.9981 }                 │
│  confusion_matrix_png     → <base64 PNG>        │
│  feature_importance_png   → <base64 PNG>        │
│  roc_curve_png            → <base64 PNG>        │
│  learning_curve_png       → <base64 PNG>        │
│  classification_report_text → "precision  re..." │
│  model_data   → <joblib pipeline bytes>         │
│  training_time_s → 2.341                        │
│  test_rows    → [ {sepal_length:5.1, ...,       │
│                    __target__: "setosa"}, ... ] │
│  created_at   → 2026-06-23 10:05:00 UTC         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  TABLE: trained_models  (row 2 — Random Forest) │
│                                                 │
│  id           → g7h8i9j0-...  (UUID, PK)        │
│  profile_id   → e5f6a7b8-...  (FK → profiles)  │
│  user_id      → a1b2c3d4-...  (FK → users)     │
│  model_name   → random_forest                   │
│  metrics      → { accuracy: 0.9600, ... }       │
│  model_data   → <joblib pipeline bytes>         │
│  ...          → same structure as above         │
└─────────────────────────────────────────────────┘
    │
    ▼
STEP 6 — Infer (no new DB write)
    │
    │  trained_models row is READ from DB
    │  model_data (joblib bytes) is loaded into memory
    │  prediction runs in MCP server
    │  result returned directly to browser — nothing saved
```

---

## Entity Relationship Summary

```
users  ──────────────────────────────────────────────────────┐
  id (PK)                                                     │
  email                                                       │
  full_name                                                   │
  password_hash                                               │
  created_at                                                  │
     │                                                        │
     │ 1 : many                                               │
     ▼                                                        │
profiles                                                      │
  id (PK)                                                     │
  user_id (FK → users.id)  ◄──────────────────────────────── │
  file_name · file_hash · file_format · file_size             │
  num_rows · num_columns                                      │
  result (JSON)  ← full profiler output                       │
  raw_data (binary) ← actual file stored here                 │
  preprocessing_ops (JSON)                                    │
     │                                                        │
     ├── 1 : 1 ──────────────────────────────────────────┐   │
     │                                                    ▼   │
     │                                         profile_embeddings
     │                                           id (PK + FK → profiles.id)
     │                                           embedding  ← 1536-dim vector
     │                                           (pgvector cosine similarity)
     │
     ├── 1 : 1 (upsert) ──────────────────────────────────┐
     │                                                     ▼
     │                                              suggestions
     │                                                id (PK)
     │                                                profile_id (FK → profiles.id)
     │                                                user_id    (FK → users.id)
     │                                                task_type
     │                                                result (JSON) ← all model suggestions
     │
     └── 1 : many ──────────────────────────────────────────┐
                                                             ▼
                                                      trained_models
                                                        id (PK)
                                                        profile_id (FK → profiles.id)
                                                        user_id    (FK → users.id)
                                                        model_name · task_type
                                                        metrics (JSON)
                                                        feature_names · target_classes
                                                        confusion_matrix_png (base64 Text)
                                                        feature_importance_png (base64 Text)
                                                        roc_curve_png (base64 Text)
                                                        learning_curve_png (base64 Text)
                                                        classification_report_text
                                                        model_data (joblib binary)
                                                        test_rows (JSON)
                                                        training_time_s
```

---

## Where Does the Embedding Fit?

The `profile_embeddings` table is a **1-to-1 extension of profiles**. When a profile is created, the backend generates a short text summary of the dataset (column names, types, row count, task type) and sends it to an embedding model via LiteLLM. The returned 1536-dimensional float vector is stored in `profile_embeddings.embedding` using the **pgvector** PostgreSQL extension.

This vector is used for **dataset similarity search** — if you upload a new dataset, DataFun can query `profile_embeddings` using cosine distance to find past datasets that are structurally similar to yours.

> **For Iris:** the embedding would be close to other small, clean, multiclass tabular classification datasets — if you later uploaded Wine or Breast Cancer datasets, they would rank as similar.

---

## Key Rules

| Rule | Where enforced |
|---|---|
| Same user cannot upload the same file twice | `UNIQUE(user_id, file_hash)` on `profiles` |
| Every profile, suggestion, and model is scoped to its owner | `user_id` FK on all tables |
| Raw file bytes are stored in the DB, not on disk | `profiles.raw_data` (LargeBinary) |
| Trained model binary is stored in the DB | `trained_models.model_data` (LargeBinary) |
| Inference never writes to DB | Read-only — model loaded, prediction returned |
| Plots stored as base64 text, not files | `confusion_matrix_png`, `roc_curve_png`, etc. |
