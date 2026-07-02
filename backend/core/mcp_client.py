"""
FastMCP client — calls the MCP server running on :8001.

The MCP server exposes two tools:
  - profile_dataset: runs pandas + scipy profiling, returns ProfileResult
  - suggest_model:   runs LangGraph 5-node agent, returns SuggestionResult
"""

import base64
import json

from fastmcp import Client

from core.config import settings


def _extract_result(result) -> dict:
    """Extract JSON dict from a FastMCP CallToolResult."""
    # result.content is a list of TextContent objects
    if hasattr(result, "content") and result.content:
        first = result.content[0]
        if hasattr(first, "text"):
            return json.loads(first.text)
    # Fallback: structured_content or data
    if hasattr(result, "data") and result.data:
        return result.data
    return result


async def call_profile_dataset(
    file_bytes: bytes,
    filename: str,
    **kwargs,
) -> dict:
    """
    Call the profile_dataset MCP tool on the MCP server.

    Args:
        file_bytes: Raw file content.
        filename:   Original filename (used for format detection by extension).
        **kwargs:   Optional params forwarded to the tool (e.g. target_column, depth).

    Returns:
        ProfileResult as a plain dict.
    """
    # MCP tools receive bytes as base64-encoded strings over the wire
    encoded = base64.b64encode(file_bytes).decode("utf-8")

    async with Client(settings.MCP_SERVER_URL) as client:
        result = await client.call_tool(
            "profile_dataset",
            {
                "file_bytes": encoded,
                "filename": filename,
                **kwargs,
            },
        )
    return _extract_result(result)


async def call_preprocess_dataset(
    file_bytes_b64: str,
    filename: str,
    operations: list,
    target_column: str | None = None,
) -> dict:
    """Call preprocess_dataset MCP tool."""
    params: dict = {"file_bytes": file_bytes_b64, "filename": filename, "operations": operations}
    if target_column:
        params["target_column"] = target_column
    async with Client(settings.MCP_SERVER_URL) as client:
        result = await client.call_tool("preprocess_dataset", params)
    return _extract_result(result)


async def call_reprofile_dataset(
    file_bytes_b64: str,
    filename: str,
    target_column: str | None = None,
) -> dict:
    """Call reprofile_dataset MCP tool (lightweight, no recommendations/plots)."""
    params: dict = {"file_bytes": file_bytes_b64, "filename": filename}
    if target_column:
        params["target_column"] = target_column
    async with Client(settings.MCP_SERVER_URL) as client:
        result = await client.call_tool("reprofile_dataset", params)
    return _extract_result(result)


async def call_suggest_models(
    profile_result: dict,
    max_suggestions: int = 5,
) -> dict:
    """Call suggest_models MCP tool (rule-based, no LLM)."""
    async with Client(settings.MCP_SERVER_URL) as client:
        result = await client.call_tool(
            "suggest_models",
            {"profile_result": profile_result, "max_suggestions": max_suggestions},
        )
    return _extract_result(result)


async def call_train_models(
    file_bytes_b64: str,
    filename: str,
    model_names: list,
    task_type: str,
    target_column: str | None = None,
    already_scaled: bool = False,
    feature_columns: list | None = None,
) -> dict:
    """Call train_models MCP tool."""
    params: dict = {
        "file_bytes": file_bytes_b64,
        "filename": filename,
        "model_names": model_names,
        "task_type": task_type,
        "already_scaled": already_scaled,
    }
    if target_column:
        params["target_column"] = target_column
    if feature_columns:
        params["feature_columns"] = feature_columns
    async with Client(settings.MCP_SERVER_URL) as client:
        result = await client.call_tool("train_models", params)
    return _extract_result(result)


async def call_run_inference(
    model_bytes_b64: str,
    feature_values: dict,
    task_type: str,
) -> dict:
    """Call run_inference MCP tool."""
    async with Client(settings.MCP_SERVER_URL) as client:
        result = await client.call_tool(
            "run_inference",
            {"model_bytes": model_bytes_b64, "feature_values": feature_values, "task_type": task_type},
        )
    return _extract_result(result)


async def call_suggest_model(
    profile_result: dict,
    **kwargs,
) -> dict:
    """
    Call the suggest_model MCP tool on the MCP server.

    Args:
        profile_result: The ProfileResult dict returned by call_profile_dataset.
        **kwargs:       Optional params forwarded to the tool (e.g. max_suggestions).

    Returns:
        SuggestionResult as a plain dict.
    """
    async with Client(settings.MCP_SERVER_URL) as client:
        result = await client.call_tool(
            "suggest_model",
            {
                "profile_result": profile_result,
                **kwargs,
            },
        )
    return _extract_result(result)
