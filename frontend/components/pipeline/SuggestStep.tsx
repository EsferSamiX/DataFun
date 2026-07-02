"use client"

import { useState } from "react"
import type { SuggestionResult } from "@/lib/api"

interface Props {
  suggestion: SuggestionResult
  onTrain: (selectedModels: string[]) => Promise<void>
  isTraining: boolean
}


export default function SuggestStep({ suggestion, onTrain, isTraining }: Props) {
  const trainable = suggestion.suggestions
  const [selected, setSelected] = useState<Set<string>>(
    new Set(trainable.map((s) => s.algorithm))
  )

  const toggle = (algo: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(algo) ? next.delete(algo) : next.add(algo)
      return next
    })
  }

  const handleTrain = async () => {
    const keys = suggestion.suggestions
      .filter((s) => selected.has(s.algorithm))
      .map((s) => s.algorithm.toLowerCase().replace(/ /g, "_").replace(/-/g, "_"))
    await onTrain(keys)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "20px 28px 16px",
        borderBottom: "1px solid #1a1a1a",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#f9fafb" }}>Model Suggestions</h2>
          <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: "15px" }}>{suggestion.problem_summary}</p>
        </div>
        <button
          onClick={handleTrain}
          disabled={selected.size === 0 || isTraining}
          style={{
            background: selected.size === 0 || isTraining
              ? "#1f1f1f"
              : "linear-gradient(135deg, #4f46e5, #7c3aed)",
            border: "none", borderRadius: "10px",
            padding: "12px 26px", color: selected.size === 0 || isTraining ? "#374151" : "#fff",
            fontSize: "16px", fontWeight: 700, whiteSpace: "nowrap",
            cursor: selected.size === 0 || isTraining ? "default" : "pointer",
          }}
        >
          {isTraining ? "Training…" : `Train ${selected.size} model${selected.size !== 1 ? "s" : ""} →`}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        {/* Metrics row */}
        {suggestion.evaluation_metrics?.length > 0 && (
          <div style={{ marginBottom: "24px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#6b7280", fontSize: "14px", fontWeight: 600 }}>Metrics:</span>
            {suggestion.evaluation_metrics.map((m) => (
              <span key={m} style={{
                background: "#1a1a2e", border: "1px solid #2a2a4a",
                borderRadius: "6px", padding: "4px 12px",
                color: "#a5b4fc", fontSize: "14px", fontWeight: 600,
              }}>{m}</span>
            ))}
          </div>
        )}

        {/* Model cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {suggestion.suggestions.map((s) => {
            const isChecked = selected.has(s.algorithm)
            return (
              <div
                key={s.algorithm}
                onClick={() => toggle(s.algorithm)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "16px",
                  padding: "20px", borderRadius: "14px",
                  border: isChecked ? "1px solid #3730a3" : "1px solid #1f1f1f",
                  background: isChecked ? "rgba(99,102,241,0.07)" : "#111",
                  cursor: "pointer",
                  opacity: 1,
                  transition: "border-color 0.15s",
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: "22px", height: "22px", borderRadius: "6px", flexShrink: 0, marginTop: "3px",
                  border: isChecked ? "none" : "1.5px solid #374151",
                  background: isChecked ? "#6366f1" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isChecked && <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>✓</span>}
                </div>

                {/* Rank badge */}
                <div style={{
                  width: "34px", height: "34px", borderRadius: "9px", flexShrink: 0,
                  background: "#1a1a2e", border: "1px solid #2a2a4a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#818cf8", fontSize: "16px", fontWeight: 800,
                }}>
                  {s.rank}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
                    <span style={{ color: "#f9fafb", fontSize: "18px", fontWeight: 700 }}>{s.algorithm}</span>
                  </div>

                  {/* Reason */}
                  <p style={{ color: "#d1d5db", fontSize: "15px", margin: "0 0 12px", lineHeight: 1.5 }}>{s.reason}</p>

                  {/* Strengths / Weaknesses */}
                  <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: "#22c55e", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>Strengths</div>
                      {s.strengths?.slice(0, 2).map((st) => (
                        <div key={st} style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "3px" }}>· {st}</div>
                      ))}
                    </div>
                    <div>
                      <div style={{ color: "#f87171", fontSize: "13px", fontWeight: 700, marginBottom: "6px" }}>Weaknesses</div>
                      {s.weaknesses?.slice(0, 2).map((w) => (
                        <div key={w} style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "3px" }}>· {w}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Concerns */}
        {suggestion.concerns?.length > 0 && (
          <div style={{ marginTop: "28px" }}>
            <div style={{ color: "#f59e0b", fontSize: "15px", fontWeight: 700, marginBottom: "10px" }}>
              ⚠ Dataset Concerns
            </div>
            {suggestion.concerns.map((c, i) => (
              <div key={i} style={{
                padding: "14px 18px", marginBottom: "8px",
                background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: "10px", color: "#fbbf24", fontSize: "15px", lineHeight: 1.5,
              }}>
                {c}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
