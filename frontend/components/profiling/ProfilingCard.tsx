"use client"

import ProfilingRing from "./ProfilingRing"

interface ProfilingCardProps {
  title: string
  status: "pending" | "running" | "done"
  summary?: string
  isSelected?: boolean
  onClick?: () => void
}

export default function ProfilingCard({ title, status, summary, isSelected, onClick }: ProfilingCardProps) {
  const isDone = status === "done"
  const isPending = status === "pending"

  const bg = isSelected ? "rgba(99,102,241,0.15)" : "#1a1a1a"
  const border = isSelected ? "#6366f1" : isDone ? "#166534" : "#2a2a2a"

  return (
    <div
      onClick={isDone ? onClick : undefined}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "12px",
        padding: "16px",
        cursor: isDone ? "pointer" : "default",
        opacity: isPending ? 0.6 : 1,
        transition: "border-color 0.2s, background 0.2s, transform 0.1s",
        minHeight: "100px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        boxShadow: isSelected ? "0 0 0 2px rgba(99,102,241,0.25)" : "none",
      }}
      onMouseEnter={isDone ? (e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = "#16a34a"
        ;(e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"
      } : undefined}
      onMouseLeave={isDone ? (e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = isDone ? "#166534" : "#2a2a2a"
        ;(e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"
      } : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <ProfilingRing status={status} size={36} />
        <span style={{
          fontSize: "15px",
          fontWeight: 600,
          color: isPending ? "#9ca3af" : "#f9fafb",
        }}>
          {title}
        </span>
      </div>
      {status === "running" && (
        <p style={{ fontSize: "13px", color: "#818cf8", margin: 0 }}>Analyzing…</p>
      )}
      {status === "done" && summary && (
        <p style={{ fontSize: "13px", color: "#e5e7eb", margin: 0, lineHeight: 1.5 }}>{summary}</p>
      )}
      {isDone && (
        <p style={{
          fontSize: "12px", margin: 0, fontWeight: 600,
          color: "#818cf8",
          display: "flex", alignItems: "center", gap: "4px",
        }}>
          View details <span style={{ fontSize: "14px" }}>→</span>
        </p>
      )}
    </div>
  )
}
