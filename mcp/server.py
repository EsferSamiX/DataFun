"""DataFun MCP server.

Exposes 6 tools over HTTP transport using FastMCP:
  - profile_dataset    — deterministic data profiling (pandas + scipy)
  - suggest_model      — legacy LLM-based suggestions (disabled in backend)
  - preprocess_dataset — apply preprocessing ops, return cleaned CSV bytes
  - suggest_models     — rule-based model suggestions (no LLM)
  - train_models       — train sklearn/xgboost/lightgbm models, return metrics + plots
  - run_inference      — run prediction on a trained model pipeline

Run with:
    uv run python server.py    # from inside the mcp/ directory
"""

from __future__ import annotations

from fastmcp import FastMCP

from tools.preprocess_dataset import preprocess_dataset
from tools.profile_dataset import profile_dataset
from tools.reprofile_dataset import reprofile_dataset
from tools.run_inference import run_inference
from tools.suggest_model import suggest_model
from tools.suggest_models import suggest_models
from tools.train_models import train_models

mcp = FastMCP("datafun-mcp")

mcp.tool()(profile_dataset)
mcp.tool()(suggest_model)
mcp.tool()(preprocess_dataset)
mcp.tool()(reprofile_dataset)
mcp.tool()(suggest_models)
mcp.tool()(train_models)
mcp.tool()(run_inference)

if __name__ == "__main__":
    mcp.run(transport="streamable-http", port=8001, host="0.0.0.0")
