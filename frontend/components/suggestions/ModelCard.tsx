"use client"

import { useState } from "react"
import type { ModelSuggestion } from "@/lib/api"
import SpeedBadge from "@/components/shared/SpeedBadge"
import ComplexityDots from "@/components/shared/ComplexityDots"
import StarterCodeBlock from "./StarterCodeBlock"

interface ModelCardProps {
  suggestion: ModelSuggestion
  starterCode?: string
}

export default function ModelCard({ suggestion, starterCode }: ModelCardProps) {
  const [showCode, setShowCode] = useState(false)

  return (
    <div style={{
      background: "#1a1a1a",
      border: "1px solid #2a2a2a",
      borderRadius: "12px",
      padding: "20px",
      marginBottom: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            background: "#312e81",
            border: "1px solid #6366f1",
            borderRadius: "8px",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#a5b4fc",
            fontWeight: 700,
            fontSize: "16px",
            flexShrink: 0,
          }}>
            #{suggestion.rank}
          </div>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "#e5e7eb" }}>{suggestion.algorithm}</div>
            <div style={{ fontSize: "12px", color: "#9ca3af" }}>{suggestion.framework}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexShrink: 0 }}>
          <SpeedBadge speed={suggestion.training_speed} />
          <ComplexityDots complexity={suggestion.complexity} />
        </div>
      </div>

      <p style={{ fontSize: "14px", color: "#d1d5db", marginBottom: "12px", lineHeight: 1.5 }}>
        {suggestion.reason}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div>
          {suggestion.strengths.map((s, i) => (
            <div key={i} style={{ fontSize: "13px", color: "#86efac", marginBottom: "4px" }}>✓ {s}</div>
          ))}
        </div>
        <div>
          {suggestion.weaknesses.map((w, i) => (
            <div key={i} style={{ fontSize: "13px", color: "#fca5a5", marginBottom: "4px" }}>△ {w}</div>
          ))}
        </div>
      </div>

      {starterCode && suggestion.rank === 1 && (
        <div>
          <button
            onClick={() => setShowCode(!showCode)}
            style={{
              background: showCode ? "#312e81" : "none",
              border: "1px solid #3730a3",
              borderRadius: "6px",
              padding: "6px 14px",
              color: "#a5b4fc",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            {showCode ? "Hide code" : "View starter code"}
          </button>
          {showCode && (
            <div style={{ marginTop: "12px" }}>
              <StarterCodeBlock code={starterCode} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
