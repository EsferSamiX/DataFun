"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { getProfile } from "@/lib/api"
import type { ProfileResult } from "@/lib/api"
import ProfilingCardGrid, { ProfilingStage } from "@/components/profiling/ProfilingCardGrid"
import CardDetailPanel from "@/components/profiling/CardDetailPanel"

// Build completed stages map from a full ProfileResult
function buildCompletedStages(profile: ProfileResult): Map<ProfilingStage, string> {
  const map = new Map<ProfilingStage, string>()
  map.set("dataset_overview", `${profile.num_rows.toLocaleString()} rows · ${profile.num_columns} columns · ${profile.memory_mb?.toFixed(1) ?? "?"} MB`)

  const missingCols = profile.columns.filter(c => c.missing_pct > 20).length
  const severeMissingCols = profile.columns.filter(c => c.missing_pct > 50).length
  map.set("missing_values", missingCols > 0 ? `${missingCols} cols >20% missing · ${severeMissingCols} cols >50%` : "No missing values detected")

  map.set("duplicates", `${profile.duplicate_rows.toLocaleString()} duplicate rows (${profile.duplicate_rows_pct.toFixed(1)}%)`)

  const numericCount = profile.columns.filter(c => c.kind === "numeric").length
  const catCount = profile.columns.filter(c => c.kind === "categorical").length
  const dtCount = profile.columns.filter(c => c.kind === "datetime").length
  map.set("column_statistics", `${numericCount} numeric · ${catCount} categorical · ${dtCount} datetime`)

  const sigCorr = profile.correlations.filter(c => c.significant).length
  map.set("correlations", `${sigCorr} significant pairs found`)

  map.set("quality_score", `Score: ${profile.quality_score}/100 · Grade ${profile.quality_grade}`)

  if (profile.target_analysis) {
    const ta = profile.target_analysis
    const taskLabel = ta.task_type.replace(/_/g, " ")
    map.set("target_analysis", `${taskLabel} · Imbalance ${ta.imbalance_ratio?.toFixed(1) ?? "N/A"}:1`)
  } else {
    map.set("target_analysis", "No target column specified")
  }

  const highPriority = profile.recommendations.filter(r => r.priority === "HIGH").length
  map.set("recommendations", `${profile.recommendations.length} recommendations (${highPriority} high priority)`)

  return map
}

export default function ProfilePage() {
  const params = useParams()
  const id = params.id as string
  const [profile, setProfile] = useState<ProfileResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<ProfilingStage | null>(null)

  useEffect(() => {
    getProfile(id)
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9ca3af" }}>Loading profile...</div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#ef4444" }}>Error: {error ?? "Profile not found"}</div>
      </div>
    )
  }

  const completedStages = buildCompletedStages(profile)

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f" }}>
      {/* Top bar */}
      <div style={{
        background: "#1a1a1a",
        borderBottom: "1px solid #2a2a2a",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/" style={{ color: "#9ca3af", fontSize: "14px" }}>← DataFun</Link>
          <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#e5e7eb" }}>
            {profile.file_name}
          </h1>
        </div>
        <Link
          href={`/profile/${id}/suggest`}
          style={{
            background: "#6366f1",
            color: "#fff",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          View Model Suggestions →
        </Link>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "20px" }}>
        <ProfilingCardGrid
          activeStage={null}
          completedStages={completedStages}
          onCardClick={(stage) => setSelectedStage(selectedStage === stage ? null : stage)}
        />
        {selectedStage && (
          <CardDetailPanel
            stage={selectedStage}
            profileResult={profile}
            onClose={() => setSelectedStage(null)}
          />
        )}
      </div>
    </div>
  )
}
