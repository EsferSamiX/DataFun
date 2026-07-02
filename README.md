<p align="center">
  <img src="frontend/public/logo.png" alt="DataFun" width="300" />
</p>

<p align="center"><sub>By <strong>Md Esfer Abdus Sami</strong></sub></p>

<h3 align="center">AI-Powered Data Profiling & Machine Learning Platform</h3>

<p align="center">
  Upload a dataset — profile it, clean it, train models, and run predictions.<br/>
  All in one guided pipeline — from raw data to working predictions.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-blue?style=flat-square&logo=python" />
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-green?style=flat-square&logo=fastapi" />
  <img src="https://img.shields.io/badge/FastMCP-3.4-purple?style=flat-square" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue?style=flat-square&logo=postgresql" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" />
</p>

---

## What is DataFun?

DataFun turns raw datasets into working machine learning pipelines without writing a single line of code. It guides you through a six-step process — profiling, preprocessing, re-profiling, model suggestion, training, and inference — all powered by a LangGraph AI agent and a scikit-learn / XGBoost / LightGBM training backend.

### Key Features

- **Instant Data Profiling** — shape, types, missing values, distributions, correlations, quality score, and visual charts generated automatically
- **Smart Preprocessing** — apply imputation, encoding, scaling, and outlier removal with a point-and-click interface
- **AI Model Suggestions** — a 5-node LangGraph agent analyses your data and ranks the best algorithms for your task type
- **One-Click Training** — trains XGBoost, LightGBM, Random Forest, Logistic Regression, Decision Tree, SVM, and more in parallel with live metrics, confusion matrices, ROC curves, and feature importance plots
- **Classification Report** — full per-class precision / recall / F1 with downloadable PNG
- **Interactive Inference** — fill in feature values or pick a test sample to run predictions instantly
- **Light / Dark Mode** — full theme support across the entire interface

---

## Architecture

```
╔═════════════════════════════════════════════════════════════════════════════════╗
║                            BROWSER  —  Next.js 14  (port 3000)                  ║
║                                                                                 ║
║   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────────┐  ║
║   │  Auth Pages  │  │  Home Page   │  │         Pipeline Wizard              │  ║
║   │              │  │              │  │                                      │  ║
║   │  Login       │  │  File Upload │  │  1. Profile   → data stats & charts  │  ║
║   │  Sign Up     │  │  Drag & Drop │  │  2. Preprocess→ clean & transform    │  ║
║   │  JWT token   │  │  CSV/Excel/  │  │  3. Re-profile→ verify quality       │  ║
║   │  storage     │  │  Parquet/... │  │  4. Suggest   → AI model picks       │  ║
║   └──────────────┘  └──────────────┘  │  5. Train     → metrics & plots      │  ║
║                                       │  6. Infer     → live predictions     │  ║
║   React · TypeScript · Dark/Light     └──────────────────────────────────────┘  ║
╚══════════════════════════════╦══════════════════════════════════════════════════╝
                               ║  HTTPS  REST / JSON
╔══════════════════════════════╩═════════════════════════════════════════════════╗
║                         BACKEND API  —  FastAPI + Uvicorn  (port 8000)         ║
║                                                                                ║
║  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐   ║
║  │   /auth         │  │   /profile       │  │   /pipeline                  │   ║
║  │                 │  │                  │  │                              │   ║
║  │  POST /register │  │  POST /upload    │  │  POST /{id}/preprocess       │   ║
║  │  POST /login    │  │  GET  /{id}      │  │  POST /{id}/suggest          │   ║
║  │  GET  /me       │  │  PATCH/{id}      │  │  POST /{id}/train            │   ║
║  │  JWT (HS256)    │  │  DELETE /{id}    │  │  GET  /{id}/models           │   ║
║  └─────────────────┘  └──────────────────┘  │  POST /models/{id}/predict   │   ║
║                                             └──────────────────────────────┘   ║
║  ┌──────────────────────────────────────────────────────────────────────────┐  ║
║  │  Core Layer                                                              │  ║
║  │  SQLAlchemy async ORM · Alembic migrations · JWT auth · httpx MCP client │  ║
║  └──────────────────────────────────────────────────────────────────────────┘  ║
╚══════════╦══════════════════════════════════════════╦══════════════════════════╝
           ║  asyncpg (SQL)                           ║  HTTP  (MCP protocol)
╔══════════╩═══════════════════╗          ╔═══════════╩════════════════════════════╗
║   PostgreSQL 16  (port 5432) ║          ║    MCP Server  —  FastMCP (port 8001)  ║
║                              ║          ║                                        ║
║  Tables                      ║          ║  Tools (called by Backend)             ║
║  ├── users                   ║          ║  ├── profile_dataset                   ║
║  │     id · email · name     ║          ║  │     pandas · scipy · quality score  ║
║  │     hashed_password       ║          ║  ├── preprocess_dataset                ║
║  ├── profiles                ║          ║  │     impute · encode · scale · dedup ║
║  │     file_name · raw_data  ║          ║  ├── reprofile_dataset                 ║
║  │     num_rows · result JSON║          ║  │     lightweight re-profile pass     ║
║  │     preprocessing_ops     ║          ║  ├── suggest_models                    ║
║  ├── suggestions             ║          ║  │     LangGraph 5-node agent          ║
║  │     task_type · result    ║          ║  │     classify → assess → rank        ║
║  └── trained_models          ║          ║  │     → code gen → flag concerns      ║
║        metrics · plots PNG   ║          ║  │     LiteLLM → OpenRouter LLM        ║
║        model_bytes (joblib)  ║          ║  ├── train_models                      ║
║        classification_report ║          ║  │     ColumnTransformer pipeline      ║
╚══════════════════════════════╝          ║  │     XGBoost · LightGBM · sklearn    ║
                                          ║  │     metrics · confusion matrix      ║
                                          ║  │     ROC curve · feature importance  ║
                                          ║  │     learning curve · joblib serial. ║
                                          ║  └── run_inference                     ║
                                          ║        load joblib · predict · decode  ║
                                          ╚════════════════════════════════════════╝
```

### Service Breakdown

| Service | Stack | Port | Responsibility |
|---|---|---|---|
| **Frontend** | Next.js 14, React, TypeScript | 3000 | UI, pipeline wizard, charts, theme |
| **Backend** | FastAPI, SQLAlchemy, LangGraph, LiteLLM | 8000 | Auth, orchestration, pipeline coordination |
| **MCP Server** | FastMCP, pandas, scikit-learn, XGBoost, LightGBM | 8001 | Data computation, model training, inference |
| **Database** | PostgreSQL 16 | 5432 | Users, profiles, suggestions, trained models |

### ML Pipeline Flow

```
Upload Dataset
      │
      ▼
 1. Profile      ← pandas profiling, scipy stats, quality scoring, target analysis
      │
      ▼
 2. Preprocess   ← imputation, encoding, scaling, outlier removal
      │
      ▼
 3. Re-profile   ← confirms preprocessing improved data quality
      │
      ▼
 4. Suggest      ← LangGraph AI agent ranks best models for your task & data
      │
      ▼
 5. Train        ← parallel training, metrics, confusion matrix, ROC, feature importance
      │
      ▼
 6. Infer        ← predict on new samples, compare against held-out test rows
```

### Supported Models

| Task | Models |
|---|---|
| **Binary Classification** | XGBoost · LightGBM · Random Forest · Logistic Regression · Decision Tree · SVM · CatBoost |
| **Multiclass Classification** | XGBoost · LightGBM · Random Forest · Logistic Regression · Decision Tree · SVM · CatBoost |
| **Regression** | XGBoost · LightGBM · Random Forest · Decision Tree · SVR · Ridge · Linear Regression |

> **Coming soon:** Clustering · Time Series Forecasting · Anomaly Detection · Deep Learning · Computer Vision

---

## Supported File Formats

CSV · TSV · Excel (xlsx, xls) · JSON · Parquet · HDF5 · ODS · SAS · Stata

---

## Requirements

| Dependency | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| PostgreSQL | 14+ |
| uv | latest |

---

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd DataFun
```

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your-secret-key

# Get a free key at https://openrouter.ai
OPENROUTER_API_KEY=sk-or-...

DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/datafun
MCP_SERVER_URL=http://localhost:8001/mcp
```

Copy `.env` to the backend and mcp directories:

```bash
cp .env backend/.env
cp .env mcp/.env
```

### 3. Database

```sql
CREATE DATABASE datafun;
```

Then run migrations from the backend:

```bash
cd backend
uv run alembic upgrade head
```

### 4. Start the MCP server

```bash
cd mcp
uv run python server.py
# → http://localhost:8001
```

### 5. Start the backend

```bash
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000
```

### 6. Start the frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

Open **http://localhost:3000**, sign up, and upload a dataset to begin.

---

## Project Structure

```
DataFun/
├── backend/               # FastAPI application
│   ├── core/              # Config, auth, MCP client
│   ├── db/                # SQLAlchemy models and session
│   └── routers/           # auth, health, pipeline, profile
├── mcp/                   # MCP compute server (FastMCP)
│   ├── core/              # Profiler, model suggester, format loader
│   └── tools/             # profile, preprocess, train, infer tools
├── frontend/              # Next.js application
│   ├── app/               # Pages (auth, pipeline, history)
│   ├── components/        # Pipeline steps, charts, layout
│   ├── contexts/          # Theme context
│   └── lib/               # API client, auth helpers
├── assets/                # Logo and branding assets
├── .env.example           # Environment variable template
└── README.md
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | Yes | — | JWT signing secret |
| `OPENROUTER_API_KEY` | Yes | — | LLM API key via OpenRouter |
| `DATABASE_URL` | Yes | — | PostgreSQL async connection string |
| `MCP_SERVER_URL` | No | `http://localhost:8001/mcp` | Internal MCP server address |
| `LITELLM_DEFAULT_MODEL` | No | `meta-llama/llama-3.3-70b-instruct` | Model used for AI suggestions |
| `MAX_UPLOAD_SIZE_MB` | No | `200` | Maximum dataset upload size |
| `ACCESS_TOKEN_EXPIRE_HOURS` | No | `24` | JWT token lifetime |

---

## License

MIT
