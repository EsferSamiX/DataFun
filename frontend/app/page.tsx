"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { uploadProfile } from "@/lib/api"
import AppSidebar from "@/components/shared/AppSidebar"

const NOTICE_KEY = "datafun_coming_soon_dismissed"

export default function HomePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNotice, setShowNotice] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(NOTICE_KEY)) setShowNotice(true)
  }, [])

  function dismissNotice() {
    localStorage.setItem(NOTICE_KEY, "1")
    setShowNotice(false)
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file) return
    const allowed = [".csv", ".xlsx", ".xls", ".parquet", ".json", ".tsv"]
    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    if (!allowed.includes(ext)) {
      setError(`Unsupported file type: ${ext}. Supported: ${allowed.join(", ")}`)
      return
    }
    setError(null)
    setIsUploading(true)
    setUploadStatus("Uploading and profiling your dataset…")
    try {
      const { profile_id } = await uploadProfile(file)
      setUploadStatus("Profile complete! Opening pipeline…")
      router.push(`/pipeline/${profile_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setIsUploading(false)
      setUploadStatus(null)
    }
  }, [router])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  return (
    <div style={{
      display: "flex", height: "100vh", background: "#0a0a0a",
      fontFamily: "'Inter', sans-serif",
    }}>
      <AppSidebar />

      {/* Coming Soon notice — must be dismissed before using the app */}
      {showNotice && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}>
          <div style={{
            background: "#0f0f1a",
            border: "1px solid #3730a3",
            borderRadius: "20px",
            padding: "32px 36px",
            maxWidth: "860px",
            width: "100%",
            boxShadow: "0 0 80px rgba(99,102,241,0.2)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
              <div style={{
                width: "42px", height: "42px", borderRadius: "12px", flexShrink: 0,
                background: "linear-gradient(135deg,#1e1b4b,#312e81)",
                border: "1px solid #4f46e5",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px",
              }}>🧪</div>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f9fafb" }}>
                  More models are on the way
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#9ca3af" }}>
                  We want every feature to be reliable before release — so learners are never misled.
                </p>
              </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "20px", marginBottom: "20px" }}>

              {/* LEFT — Available now */}
              <div style={{
                background: "rgba(16,185,129,0.07)",
                border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: "14px",
                padding: "20px",
              }}>
                <p style={{ margin: "0 0 14px", fontSize: "11px", fontWeight: 700, color: "#10b981", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  ✅ Available now
                </p>
                {[
                  {
                    label: "Binary Classification",
                    models: ["XGBoost", "LightGBM", "Random Forest", "Logistic Regression", "Decision Tree", "SVM", "CatBoost"],
                  },
                  {
                    label: "Multiclass Classification",
                    models: ["XGBoost", "LightGBM", "Random Forest", "Logistic Regression", "Decision Tree", "SVM", "CatBoost"],
                  },
                  {
                    label: "Regression",
                    models: ["XGBoost", "LightGBM", "Random Forest", "Decision Tree", "SVR", "Ridge", "Linear Regression"],
                  },
                ].map(({ label, models }) => (
                  <div key={label} style={{ marginBottom: "16px" }}>
                    <p style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: 700, color: "#f9fafb" }}>{label}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                      {models.map((m) => (
                        <span key={m} style={{
                          background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
                          borderRadius: "5px", padding: "2px 8px",
                          fontSize: "11px", fontWeight: 600, color: "#6ee7b7",
                        }}>{m}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* RIGHT — Coming soon */}
              <div style={{
                background: "rgba(99,102,241,0.05)",
                border: "1px solid #2a2a4a",
                borderRadius: "14px",
                padding: "20px",
              }}>
                <p style={{ margin: "0 0 14px", fontSize: "11px", fontWeight: 700, color: "#818cf8", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  🔜 Coming soon
                </p>
                {[
                  ["🔵", "Clustering", ["K-Means", "DBSCAN", "Gaussian Mixture"]],
                  ["🟠", "Time Series Forecasting", ["ARIMA", "Prophet", "LightGBM (lag)"]],
                  ["🔴", "Anomaly Detection", ["Isolation Forest", "One-Class SVM"]],
                  ["🟣", "Deep Learning", ["Lightweight MLPs", "Tabular neural nets"]],
                  ["🟢", "Computer Vision", ["Image recognition", "Lightweight CNNs"]],
                ].map(([icon, title, chips]) => (
                  <div key={title as string} style={{ marginBottom: "14px" }}>
                    <p style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: 700, color: "#e5e7eb" }}>
                      <span style={{ marginRight: "6px" }}>{icon}</span>{title}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                      {(chips as string[]).map((c) => (
                        <span key={c} style={{
                          background: "rgba(99,102,241,0.12)", border: "1px solid #3730a3",
                          borderRadius: "5px", padding: "2px 8px",
                          fontSize: "11px", fontWeight: 600, color: "#a5b4fc",
                        }}>{c}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontSize: "13px", color: "#9ca3af", margin: "0 0 20px", lineHeight: 1.6, textAlign: "center" }}>
              Each new category will be enabled only after rigorous internal testing. Stay tuned — and thank you for your patience.
            </p>

            {/* Dismiss button */}
            <button
              onClick={dismissNotice}
              style={{
                width: "100%", padding: "13px",
                background: "linear-gradient(135deg,#4f46e5,#6366f1)",
                border: "none", borderRadius: "10px",
                color: "#fff", fontSize: "15px", fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Got it — let me explore DataFun
            </button>
          </div>
        </div>
      )}

      {/* Main upload area */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        overflowY: "auto",
      }}>
      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <img
          src="/logo.png"
          alt="DataFun"
          style={{
            height: "280px", width: "auto",
            display: "block",
            margin: "0 auto 16px",
          }}
        />
        <p style={{ color: "#6b7280", fontSize: "15px", margin: 0 }}>
          Upload a dataset to start the ML pipeline
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        style={{
          width: "100%",
          maxWidth: "560px",
          borderRadius: "20px",
          border: `2px dashed ${isDragging ? "#6366f1" : isUploading ? "#374151" : "#27272a"}`,
          background: isDragging ? "rgba(99,102,241,0.06)" : "#111111",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 32px",
          cursor: isUploading ? "default" : "pointer",
          transition: "border-color 0.2s, background 0.2s",
          boxShadow: isDragging ? "0 0 0 4px rgba(99,102,241,0.15)" : "none",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.parquet,.json,.tsv"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {isUploading ? (
          <>
            <div style={{
              width: "56px", height: "56px", borderRadius: "50%",
              border: "3px solid #27272a", borderTopColor: "#6366f1",
              animation: "spin 1s linear infinite", marginBottom: "20px",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <p style={{ color: "#a5b4fc", fontSize: "16px", fontWeight: 500, margin: 0 }}>{uploadStatus}</p>
          </>
        ) : (
          <>
            {/* Big upload icon */}
            <div style={{
              width: "80px", height: "80px", borderRadius: "20px",
              background: "linear-gradient(135deg, #1e1b4b, #312e81)",
              border: "1px solid #3730a3",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "24px",
              fontSize: "36px",
            }}>
              ↑
            </div>
            <p style={{ color: "#e5e7eb", fontSize: "18px", fontWeight: 600, margin: "0 0 8px" }}>
              Drop your dataset here
            </p>
            <p style={{ color: "#9ca3af", fontSize: "14px", margin: "0 0 20px" }}>
              or click to browse files
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
              {["CSV", "Excel", "Parquet", "JSON", "TSV"].map((fmt) => (
                <span key={fmt} style={{
                  background: "#1a1a2e", border: "1px solid #3730a3",
                  borderRadius: "6px", padding: "4px 12px",
                  color: "#a5b4fc", fontSize: "12px", fontWeight: 600,
                }}>{fmt}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: "16px", padding: "12px 20px",
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "10px", color: "#f87171", fontSize: "14px",
          maxWidth: "560px", width: "100%",
        }}>
          {error}
        </div>
      )}

      {/* Pipeline steps preview */}
      <div style={{
        display: "flex", gap: "0", marginTop: "56px",
        maxWidth: "700px", width: "100%", justifyContent: "center",
      }}>
        {["Profile", "Preprocess", "Suggest", "Train", "Infer"].map((step, i) => (
          <div key={step} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ textAlign: "center", padding: "0 10px" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "50%",
                background: "#1a1a2e", border: "1px solid #3730a3",
                color: "#a5b4fc", fontSize: "15px", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 8px",
              }}>
                {i + 1}
              </div>
              <span style={{ color: "#d1d5db", fontSize: "13px", fontWeight: 600 }}>{step}</span>
            </div>
            {i < 4 && (
              <div style={{ width: "28px", height: "1px", background: "#27272a", margin: "0 0 26px" }} />
            )}
          </div>
        ))}
      </div>
      </div>{/* end main upload area */}
    </div>
  )
}
