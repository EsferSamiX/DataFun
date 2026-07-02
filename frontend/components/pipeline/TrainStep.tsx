"use client"

import { useState, useEffect, useCallback } from "react"
import type { TrainedModelResult } from "@/lib/api"

interface Props {
  models: TrainedModelResult[]
  isTraining: boolean
  pendingModelNames: string[]
  fileName?: string
  onInfer: (model: TrainedModelResult) => void
  onViewProfile?: () => void
}

function fmt(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

function datasetLabel(fileName?: string) {
  if (!fileName) return ""
  return fileName.replace(/\.[^.]+$/, "")
}

// Download a base64 PNG, compositing a title bar above the image via canvas
function downloadPlot(base64: string, modelName: string, fileName: string | undefined, plotLabel: string) {
  const img = new window.Image()
  img.onload = () => {
    const title = `${fmt(modelName)}  ·  ${datasetLabel(fileName)}  ·  ${plotLabel}`
    const titleH = 40
    const pad = 16
    const canvas = document.createElement("canvas")
    canvas.width = img.width
    canvas.height = img.height + titleH
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = `bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.fillStyle = "#111827"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(title, canvas.width / 2, titleH / 2, canvas.width - pad * 2)
    ctx.drawImage(img, 0, titleH)
    const a = document.createElement("a")
    a.download = `${modelName}__${datasetLabel(fileName)}__${plotLabel.toLowerCase().replace(/\s+/g, "_")}.png`
    a.href = canvas.toDataURL("image/png")
    a.click()
  }
  img.src = `data:image/png;base64,${base64}`
}

// Render classification report text to a PNG and download it
function downloadReport(reportText: string, modelName: string, fileName: string | undefined) {
  const title = `${fmt(modelName)}  ·  ${datasetLabel(fileName)}  ·  Classification Report`
  const lines = reportText.split("\n")
  const lineH = 18
  const pad = 20
  const titleH = 44
  const fontPx = 12
  const width = 640
  const height = titleH + lines.length * lineH + pad * 2

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)

  // Title
  ctx.font = `bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.fillStyle = "#111827"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(title, width / 2, titleH / 2, width - pad * 2)

  // Divider
  ctx.strokeStyle = "#e5e7eb"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, titleH)
  ctx.lineTo(width - pad, titleH)
  ctx.stroke()

  // Report text
  ctx.font = `${fontPx}px "Courier New", Courier, monospace`
  ctx.fillStyle = "#374151"
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, titleH + pad + i * lineH)
  })

  const a = document.createElement("a")
  a.download = `${modelName}__${datasetLabel(fileName)}__classification_report.png`
  a.href = canvas.toDataURL("image/png")
  a.click()
}

// Lightbox modal
function Lightbox({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "12px", overflow: "hidden",
          maxWidth: "90vw", maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Lightbox header */}
        <div style={{
          padding: "10px 16px", background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "16px",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: "20px",
              cursor: "pointer", color: "#6b7280", lineHeight: 1, padding: "0 4px",
            }}
          >×</button>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          <img
            src={`data:image/png;base64,${src}`}
            alt={title}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
        </div>
      </div>
    </div>
  )
}

function MetricBadge({ label, value }: { label: string; value: number }) {
  const pctMetrics = new Set(["accuracy", "precision", "recall", "f1", "auc"])
  const isPct = pctMetrics.has(label)
  const pct = isPct ? Math.round(value * 100) : null
  const color = pct == null
    ? "#e5e7eb"
    : pct >= 90 ? "#22c55e"
    : pct >= 70 ? "#f59e0b"
    : "#ef4444"
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        color: "#9ca3af", fontSize: "12px", marginBottom: "4px",
        textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
      }}>
        {label}
      </div>
      <div style={{ color, fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em" }}>
        {pct != null ? `${pct}%` : value.toFixed(3)}
      </div>
    </div>
  )
}

function PlotSection({
  label, src, alt, modelName, fileName, onExpand,
}: {
  label: string; src: string; alt: string
  modelName: string; fileName?: string
  onExpand: () => void
}) {
  return (
    <div style={{ flex: "1 1 0", minWidth: "220px", maxWidth: "480px" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "6px",
      }}>
        <span style={{ color: "#4b5563", fontSize: "11px", fontWeight: 600 }}>{label}</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={onExpand}
            title="View full size"
            style={{
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: "5px", padding: "2px 7px", cursor: "pointer",
              color: "#818cf8", fontSize: "11px", fontWeight: 600,
            }}
          >⛶ Expand</button>
          <button
            onClick={() => downloadPlot(src, modelName, fileName, label)}
            title="Download PNG"
            style={{
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: "5px", padding: "2px 7px", cursor: "pointer",
              color: "#4ade80", fontSize: "11px", fontWeight: 600,
            }}
          >↓ PNG</button>
        </div>
      </div>
      <img
        src={`data:image/png;base64,${src}`}
        alt={alt}
        onClick={onExpand}
        style={{
          width: "100%", height: "280px", objectFit: "contain",
          borderRadius: "8px", border: "1px solid #1f1f1f",
          background: "#fff", cursor: "zoom-in",
        }}
      />
    </div>
  )
}

function ModelCard({ model, fileName, onInfer }: {
  model: TrainedModelResult
  fileName?: string
  onInfer: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)

  const openLightbox = useCallback((src: string, label: string) => {
    setLightbox({
      src,
      title: `${fmt(model.model_name)}  ·  ${datasetLabel(fileName)}  ·  ${label}`,
    })
  }, [model.model_name, fileName])

  if (model.error) {
    return (
      <div style={{ background: "#111", border: "1px solid #3b0000", borderRadius: "14px", padding: "20px" }}>
        <div style={{ color: "#f87171", fontWeight: 600, marginBottom: "6px" }}>{model.model_name}</div>
        <div style={{ color: "#4b5563", fontSize: "13px" }}>Training failed: {model.error}</div>
      </div>
    )
  }

  const metrics = model.metrics ?? {}

  const plots: { label: string; field: keyof TrainedModelResult; alt: string }[] = [
    { label: "CONFUSION MATRIX",           field: "confusion_matrix_png",        alt: "Confusion matrix" },
    {
      label: model.task_type === "regression" || model.task_type === "time_series"
        ? "PREDICTED vs ACTUAL"
        : "FEATURE IMPORTANCE",
      field: "feature_importance_png",
      alt: "Feature importance",
    },
    { label: "ROC CURVE",                  field: "roc_curve_png",               alt: "ROC curve" },
    { label: "RESIDUALS",                  field: "residual_plot_png",            alt: "Residual plot" },
    { label: "ACTUAL vs PREDICTED (TIME)", field: "ts_actual_vs_predicted_png",  alt: "Time series" },
    { label: "LEARNING CURVE",             field: "learning_curve_png",          alt: "Learning curve" },
  ]

  const activePlots = plots.filter(p => model[p.field])

  return (
    <>
      {lightbox && (
        <Lightbox
          src={lightbox.src}
          title={lightbox.title}
          onClose={() => setLightbox(null)}
        />
      )}

      <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: "14px", overflow: "hidden", flexShrink: 0 }}>
        {/* Header */}
        <div style={{
          padding: "14px 20px", display: "flex", alignItems: "center",
          justifyContent: "space-between", background: "#0d0d0d",
          borderBottom: expanded ? "1px solid #1a1a1a" : "none",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#f9fafb", fontSize: "17px", fontWeight: 700 }}>
              {fmt(model.model_name)}
            </div>
            <div style={{ color: "#9ca3af", fontSize: "13px", marginTop: "4px", fontWeight: 500 }}>
              {model.task_type} · {model.training_time_s?.toFixed(2)}s training
            </div>
          </div>

          {Object.keys(metrics).length > 0 && (
            <div style={{ display: "flex", gap: "20px", marginRight: "20px", flexShrink: 0 }}>
              {Object.entries(metrics).map(([k, v]) =>
                typeof v === "number" && <MetricBadge key={k} label={k} value={v} />
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: "rgba(99,102,241,0.08)", border: "1px solid #27272a",
                borderRadius: "8px", padding: "7px 12px",
                color: "#6b7280", fontSize: "13px", cursor: "pointer",
              }}
              title={expanded ? "Collapse" : "Show report & plots"}
            >
              {expanded ? "▲" : "▼"}
            </button>
            <button
              onClick={onInfer}
              style={{
                background: "rgba(99,102,241,0.15)", border: "1px solid #3730a3",
                borderRadius: "8px", padding: "7px 16px",
                color: "#a5b4fc", fontSize: "13px", fontWeight: 500, cursor: "pointer",
              }}
            >
              Test model →
            </button>
          </div>
        </div>

        {/* Expanded: classification report + plots */}
        {expanded && (
          <div>
            {model.classification_report_text && (
              <div style={{ padding: "16px 20px" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: "6px",
                }}>
                  <span style={{ color: "#4b5563", fontSize: "11px", fontWeight: 600 }}>
                    CLASSIFICATION REPORT
                  </span>
                  <button
                    onClick={() => downloadReport(model.classification_report_text!, model.model_name, fileName)}
                    title="Download as PNG"
                    style={{
                      background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
                      borderRadius: "5px", padding: "3px 9px", cursor: "pointer",
                      color: "#4ade80", fontSize: "11px", fontWeight: 600,
                    }}
                  >↓ Download PNG</button>
                </div>
                <pre style={{
                  margin: 0, padding: "12px 14px",
                  background: "#0a0a0a", border: "1px solid #1f1f1f", borderRadius: "8px",
                  color: "#9ca3af", fontSize: "11px", lineHeight: 1.7,
                  overflowX: "auto", fontFamily: "monospace", whiteSpace: "pre",
                }}>
                  {model.classification_report_text}
                </pre>
              </div>
            )}

            {activePlots.length > 0 && (
              <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                {Array.from({ length: Math.ceil(activePlots.length / 2) }, (_, i) => (
                  <div key={i} style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    {activePlots.slice(i * 2, i * 2 + 2).map(p => (
                      <PlotSection
                        key={p.field}
                        label={p.label}
                        src={model[p.field] as string}
                        alt={p.alt}
                        modelName={model.model_name}
                        fileName={fileName}
                        onExpand={() => openLightbox(model[p.field] as string, p.label)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {!model.classification_report_text && activePlots.length === 0 && (
              <div style={{ padding: "16px 20px", color: "#4b5563", fontSize: "13px" }}>
                No additional details available.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function SkeletonCard({ name }: { name: string }) {
  return (
    <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: "14px", overflow: "hidden" }}>
      <div style={{
        padding: "16px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: "1px solid #1a1a1a", background: "#0d0d0d",
      }}>
        <div>
          <div style={{ color: "#f9fafb", fontSize: "17px", fontWeight: 700 }}>{fmt(name)}</div>
          <div style={{ color: "#6366f1", fontSize: "13px", marginTop: "4px", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              display: "inline-block", width: "10px", height: "10px", borderRadius: "50%",
              border: "2px solid #6366f1", borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
            }} />
            Training in progress…
          </div>
        </div>
      </div>
      <div style={{ height: "3px", background: "#1a1a1a" }}>
        <div style={{
          height: "100%",
          background: "linear-gradient(90deg, transparent, #6366f1, transparent)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s ease-in-out infinite",
        }} />
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>
    </div>
  )
}

export default function TrainStep({ models, isTraining, pendingModelNames, fileName, onInfer, onViewProfile }: Props) {
  if (isTraining && models.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f9fafb" }}>Training Models</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "13px" }}>
            This usually takes 10–60 seconds per model
          </p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {pendingModelNames.map((name) => <SkeletonCard key={name} name={name} />)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        padding: "16px 28px", borderBottom: "1px solid #1a1a1a", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f9fafb" }}>Training Results</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "13px" }}>
            {models.length} model{models.length !== 1 ? "s" : ""} trained · Click "Test model" to run inference
          </p>
        </div>
        {onViewProfile && (
          <button
            onClick={onViewProfile}
            style={{
              background: "rgba(99,102,241,0.12)", border: "1px solid #3730a3",
              borderRadius: "10px", padding: "9px 18px",
              color: "#a5b4fc", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: "7px",
            }}
          >
            <span style={{ fontSize: "15px" }}>📊</span> View Profile
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {models.map((m) => (
          <ModelCard key={m.model_id} model={m} fileName={fileName} onInfer={() => onInfer(m)} />
        ))}
      </div>
    </div>
  )
}
