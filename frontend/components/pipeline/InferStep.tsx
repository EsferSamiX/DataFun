"use client"

import { useState, useRef } from "react"
import type { TrainedModelResult, InferenceResult, ColumnInfo } from "@/lib/api"

interface Props {
  model: TrainedModelResult
  featureColumns: ColumnInfo[]
  onPredict: (featureValues: Record<string, unknown>) => Promise<InferenceResult>
  onBack: () => void
}

function ProbabilityBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ color: "#9ca3af", fontSize: "13px" }}>{label}</span>
        <span style={{ color: "#e5e7eb", fontSize: "13px", fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: "6px", background: "#1f1f1f", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: pct >= 70 ? "#6366f1" : "#374151",
          borderRadius: "3px", transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  )
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  const [flash, setFlash] = useState(false)
  const handleClick = () => {
    onClick()
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
  }
  return (
    <button
      onClick={handleClick}
      style={{
        background: "#1a1a1a", border: "1px solid #3730a3", borderRadius: "12px",
        padding: "2px 8px", color: "#a5b4fc", fontSize: "11px", cursor: "pointer",
        opacity: flash ? 0.5 : 1, transition: "opacity 0.15s",
      }}
    >
      {label}
    </button>
  )
}

export default function InferStep({ model, featureColumns, onPredict, onBack }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<InferenceResult | null>(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null)
  const formTopRef = useRef<HTMLDivElement>(null)

  const features = model.feature_names ?? []
  const testRows = model.test_rows ?? []
  const targetColumn = model.target_column ?? null

  const colMap = new Map<string, ColumnInfo>()
  for (const col of featureColumns) {
    colMap.set(col.name, col)
  }

  const setField = (feat: string, val: string) =>
    setValues((prev) => ({ ...prev, [feat]: val }))

  const handleRowClick = (row: Record<string, unknown>, idx: number) => {
    const next: Record<string, string> = {}
    for (const feat of features) {
      const v = row[feat]
      next[feat] = v == null ? "" : String(v)
    }
    setValues(next)
    setSelectedRowIdx(idx)
    formTopRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const handlePredict = async () => {
    setIsPredicting(true)
    setError(null)
    setResult(null)
    try {
      const coerced: Record<string, unknown> = {}
      for (const f of features) {
        const val = values[f] ?? ""
        const num = Number(val)
        coerced[f] = !isNaN(num) && val !== "" ? num : val
      }
      const res = await onPredict(coerced)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inference failed")
    } finally {
      setIsPredicting(false)
    }
  }

  const allFilled = features.every((f) => (values[f] ?? "").trim() !== "")

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "20px 28px 16px", borderBottom: "1px solid #1a1a1a",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f9fafb" }}>
            {model.model_name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())} — Inference
          </h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "13px" }}>
            {testRows.length > 0
              ? "Click a test sample on the right to fill fields automatically, then run prediction"
              : "Enter feature values and run prediction"}
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            border: "none", borderRadius: "10px",
            padding: "9px 20px", color: "#fff",
            fontSize: "13px", fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: "8px",
            boxShadow: "0 2px 12px rgba(99,102,241,0.35)",
          }}
        >
          <span style={{ fontSize: "16px" }}>⬅</span> Back to Results
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "32px" }}>

          {/* ── Left: feature inputs ── */}
          <div ref={formTopRef}>
            <div style={{ color: "#6b7280", fontSize: "12px", fontWeight: 600, marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Feature Values ({features.length} features)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {features.map((feat) => {
                const info = colMap.get(feat)
                const isNumeric = info && (info.type === "float" || info.type === "integer")
                const isCat = info && (info.type === "categorical" || info.type === "string")

                let placeholder = "Enter value…"
                if (isNumeric && (info.mean != null || info.p50 != null)) {
                  const ex = info.mean ?? info.p50
                  placeholder = `e.g. ${typeof ex === "number" ? ex.toFixed(2) : ex}`
                } else if (isCat && (info.mode || (info.top_values && info.top_values.length > 0))) {
                  placeholder = `e.g. ${info.mode ?? info.top_values![0].value}`
                }

                const numChips: { label: string; value: number }[] = []
                if (isNumeric) {
                  if (info.min != null) numChips.push({ label: `Min (${info.min})`, value: info.min })
                  if (info.mean != null) numChips.push({ label: `Mean (${info.mean.toFixed(2)})`, value: info.mean })
                  if (info.p50 != null) numChips.push({ label: `Median (${info.p50.toFixed(2)})`, value: info.p50 })
                  if (info.max != null) numChips.push({ label: `Max (${info.max})`, value: info.max })
                }

                const catChips = isCat ? (info.top_values ?? []).slice(0, 3) : []

                return (
                  <div key={feat}>
                    <label style={{ color: "#a5b4fc", fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      {feat}
                    </label>
                    <input
                      type="text"
                      value={values[feat] ?? ""}
                      onChange={(e) => setField(feat, e.target.value)}
                      placeholder={placeholder}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "#0f0f0f", border: "1px solid #27272a",
                        borderRadius: "8px", padding: "9px 12px",
                        color: "#a5b4fc", fontSize: "13px", fontWeight: 700, outline: "none",
                      }}
                    />
                    {isNumeric && info.min != null && info.max != null && (
                      <div style={{ color: "#4b5563", fontSize: "11px", marginTop: "3px" }}>
                        range: {info.min} – {info.max}
                      </div>
                    )}
                    {(numChips.length > 0 || catChips.length > 0) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px" }}>
                        {numChips.map((c) => (
                          <Chip key={c.label} label={c.label} onClick={() => setField(feat, String(c.value))} />
                        ))}
                        {catChips.map((c) => (
                          <Chip key={c.value} label={c.value} onClick={() => setField(feat, c.value)} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={handlePredict}
              disabled={!allFilled || isPredicting}
              style={{
                marginTop: "20px", width: "100%",
                background: !allFilled || isPredicting
                  ? "#1f1f1f"
                  : "linear-gradient(135deg, #4f46e5, #7c3aed)",
                border: "none", borderRadius: "10px",
                padding: "12px", color: !allFilled || isPredicting ? "#374151" : "#fff",
                fontSize: "14px", fontWeight: 600,
                cursor: !allFilled || isPredicting ? "default" : "pointer",
              }}
            >
              {isPredicting ? "Predicting…" : "Run Prediction"}
            </button>
          </div>

          {/* ── Right: test samples + prediction result ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {testRows.length > 0 && (
              <div>
                <div style={{ color: "#6b7280", fontSize: "12px", fontWeight: 600, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Test Samples — click a row to fill fields
                </div>
                <div style={{
                  maxHeight: "340px", overflowY: "auto", overflowX: "auto",
                  background: "#0d0d0d", border: "1px solid #1f1f1f", borderRadius: "10px",
                }}>
                  <table style={{ borderCollapse: "collapse", fontSize: "12px", width: "max-content", minWidth: "100%" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1f1f1f" }}>
                        {features.map((f) => (
                          <th key={f} style={{
                            padding: "8px 10px", color: "#a5b4fc", fontWeight: 700,
                            textAlign: "left", whiteSpace: "nowrap", position: "sticky", top: 0,
                            background: "#0d0d0d", maxWidth: "120px", overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>
                            {f}
                          </th>
                        ))}
                        {targetColumn && (
                          <th style={{
                            padding: "8px 10px", color: "#6366f1", fontWeight: 600,
                            textAlign: "left", whiteSpace: "nowrap", position: "sticky", top: 0,
                            background: "#0d0d0d",
                          }}>
                            Actual ({targetColumn})
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {testRows.map((row, idx) => (
                        <tr
                          key={idx}
                          onClick={() => handleRowClick(row, idx)}
                          style={{
                            borderBottom: "1px solid #111",
                            background: selectedRowIdx === idx ? "rgba(99,102,241,0.08)" : "transparent",
                            outline: selectedRowIdx === idx ? "1px solid #3730a3" : "none",
                            cursor: "pointer",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (selectedRowIdx !== idx)
                              (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.03)"
                          }}
                          onMouseLeave={(e) => {
                            if (selectedRowIdx !== idx)
                              (e.currentTarget as HTMLTableRowElement).style.background = "transparent"
                          }}
                        >
                          {features.map((f) => {
                            const raw = row[f]
                            const display = raw == null
                              ? "—"
                              : typeof raw === "number"
                              ? (Number.isInteger(raw) ? String(raw) : raw.toFixed(4))
                              : String(raw)
                            return (
                              <td key={f} style={{
                                padding: "7px 10px", color: "#9ca3af", whiteSpace: "nowrap",
                                maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis",
                              }}>
                                {display}
                              </td>
                            )
                          })}
                          {targetColumn && (
                            <td style={{ padding: "7px 10px", color: "#a5b4fc", fontWeight: 600, whiteSpace: "nowrap" }}>
                              {row["__target__"] == null ? "—" : String(row["__target__"])}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <div style={{ color: "#6b7280", fontSize: "12px", fontWeight: 600, marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Prediction Result
              </div>

              {!result && !error && (
                <div style={{
                  height: "120px", maxWidth: "420px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#111", border: "1px dashed #1f1f1f", borderRadius: "14px",
                  color: "#374151", fontSize: "14px",
                }}>
                  {testRows.length > 0 ? "Click a sample row, then click Predict" : "Fill in features and click Predict"}
                </div>
              )}

              {error && (
                <div style={{
                  padding: "16px", maxWidth: "420px",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px",
                  color: "#f87171", fontSize: "13px",
                }}>
                  {error}
                </div>
              )}

              {result && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "420px" }}>
                  <div style={{
                    background: "rgba(99,102,241,0.1)", border: "1px solid #3730a3",
                    borderRadius: "14px", padding: "16px 24px", textAlign: "center",
                    display: "inline-block", minWidth: "180px",
                  }}>
                    <div style={{ color: "#6366f1", fontSize: "11px", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase" }}>
                      Prediction
                    </div>
                    <div style={{ color: "#a5b4fc", fontSize: "32px", fontWeight: 800 }}>
                      {String(result.prediction)}
                    </div>
                    {result.anomaly != null && (
                      <div style={{ marginTop: "8px", fontSize: "13px", color: result.anomaly ? "#ef4444" : "#22c55e" }}>
                        {result.anomaly ? "⚠ Anomaly detected" : "✓ Normal"}
                      </div>
                    )}
                    {result.cluster != null && (
                      <div style={{ marginTop: "8px", color: "#6b7280", fontSize: "13px" }}>
                        Cluster {result.cluster}
                      </div>
                    )}
                  </div>

                  {result.probabilities && Object.keys(result.probabilities).length > 0 && (
                    <div style={{
                      background: "#111", border: "1px solid #1f1f1f",
                      borderRadius: "12px", padding: "16px",
                    }}>
                      <div style={{ color: "#6b7280", fontSize: "12px", fontWeight: 600, marginBottom: "12px" }}>
                        CLASS PROBABILITIES
                      </div>
                      {Object.entries(result.probabilities)
                        .sort(([, a], [, b]) => b - a)
                        .map(([cls, prob]) => (
                          <ProbabilityBar key={cls} label={cls} value={prob} />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
