"use client"

export type PipelineStep =
  | "profile"
  | "preprocess"
  | "reprofile"
  | "suggest"
  | "train"
  | "infer"

const STEPS: { id: PipelineStep; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "preprocess", label: "Preprocess" },
  { id: "reprofile", label: "Re-profile" },
  { id: "suggest", label: "Suggest" },
  { id: "train", label: "Train" },
  { id: "infer", label: "Infer" },
]

interface Props {
  current: PipelineStep
  completed: Set<PipelineStep>
}

export default function StepBar({ current, completed }: Props) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "0 32px",
      height: "60px",
      background: "#111827",
      borderBottom: "1px solid #1e293b",
      overflowX: "auto",
      flexShrink: 0,
    }}>
      {STEPS.map((step, i) => {
        const isDone = completed.has(step.id)
        const isActive = step.id === current

        const dotBg = isDone ? "#16a34a" : isActive ? "#4f46e5" : "#1f2937"
        const dotColor = isDone ? "#bbf7d0" : isActive ? "#e0e7ff" : "#6b7280"
        const textColor = isDone ? "#86efac" : isActive ? "#c7d2fe" : "#6b7280"
        const border = isActive ? "1px solid #4338ca" : isDone ? "1px solid #15803d" : "1px solid #1f2937"
        const bg = isActive ? "rgba(79,70,229,0.18)" : isDone ? "rgba(22,163,74,0.12)" : "transparent"

        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "5px 14px", borderRadius: "20px",
              background: bg,
              border,
            }}>
              <div style={{
                width: "20px", height: "20px", borderRadius: "50%",
                background: dotBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", fontWeight: 700, color: dotColor, flexShrink: 0,
              }}>
                {isDone ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: "14px", fontWeight: isActive ? 700 : 500, color: textColor, whiteSpace: "nowrap" }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: "24px", height: "1px", background: "#2d2d2d", margin: "0 4px" }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
