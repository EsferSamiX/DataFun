"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { getSuggestion, getProfile } from "@/lib/api"
import type { SuggestionResult, ProfileResult } from "@/lib/api"
import ModelRankingList from "@/components/suggestions/ModelRankingList"
import ConcernsList from "@/components/suggestions/ConcernsList"
import PreprocessingChecklist from "@/components/suggestions/PreprocessingChecklist"

export default function SuggestPage() {
  const params = useParams()
  const id = params.id as string
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null)
  const [profile, setProfile] = useState<ProfileResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getSuggestion(id), getProfile(id)])
      .then(([s, p]) => { setSuggestion(s); setProfile(p) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9ca3af" }}>Loading suggestions...</div>
      </div>
    )
  }

  if (error || !suggestion) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#ef4444" }}>Error: {error ?? "Suggestions not found"}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f" }}>
      {/* Top bar */}
      <div style={{
        background: "#1a1a1a",
        borderBottom: "1px solid #2a2a2a",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}>
        <Link href={`/profile/${id}`} style={{ color: "#9ca3af", fontSize: "14px" }}>
          ← {profile?.file_name ?? "Profile"}
        </Link>
        <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#e5e7eb" }}>
          Model Suggestions
        </h1>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* Summary */}
        <div style={{
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: "12px",
          padding: "16px 20px",
        }}>
          <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: "4px" }}>Task Type</div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#e5e7eb", marginBottom: "8px" }}>
            {suggestion.task_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </div>
          <p style={{ margin: 0, fontSize: "14px", color: "#9ca3af", lineHeight: 1.5 }}>
            {suggestion.problem_summary}
          </p>
        </div>

        {/* Model rankings */}
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#e5e7eb", marginBottom: "12px" }}>
            Recommended Models
          </h2>
          <ModelRankingList suggestions={suggestion.suggestions} starterCode={suggestion.starter_code} />
        </div>

        {/* Evaluation metrics */}
        {suggestion.evaluation_metrics.length > 0 && (
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#e5e7eb", marginBottom: "10px" }}>
              Evaluation Metrics
            </h3>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {suggestion.evaluation_metrics.map((m) => (
                <span key={m} style={{
                  background: "#1e1b4b",
                  border: "1px solid #3730a3",
                  borderRadius: "6px",
                  padding: "4px 12px",
                  color: "#a5b4fc",
                  fontSize: "13px",
                }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Concerns */}
        <ConcernsList concerns={suggestion.concerns} />

        {/* Preprocessing */}
        <PreprocessingChecklist steps={suggestion.preprocessing_steps} />
      </div>
    </div>
  )
}
