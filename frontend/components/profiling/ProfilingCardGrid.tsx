"use client"

import ProfilingCard from "./ProfilingCard"

export type ProfilingStage =
  | "dataset_overview"
  | "missing_values"
  | "duplicates"
  | "column_statistics"
  | "correlations"
  | "quality_score"
  | "target_analysis"
  | "recommendations"
  | "columns"

export interface StageInfo {
  id: ProfilingStage
  title: string
  summary?: string
}

const ALL_STAGES: StageInfo[] = [
  { id: "dataset_overview", title: "Dataset Overview" },
  { id: "missing_values", title: "Missing Values" },
  { id: "duplicates", title: "Duplicate Detection" },
  { id: "column_statistics", title: "Column Statistics" },
  { id: "correlations", title: "Correlation Analysis" },
  { id: "quality_score", title: "Quality Score" },
  { id: "target_analysis", title: "Target Analysis" },
  { id: "recommendations", title: "Recommendations" },
  { id: "columns", title: "Columns" },
]

interface ProfilingCardGridProps {
  activeStage?: ProfilingStage | null
  selectedStage?: ProfilingStage | null
  completedStages: Map<ProfilingStage, string>
  onCardClick?: (stage: ProfilingStage) => void
}

export default function ProfilingCardGrid({ activeStage, selectedStage, completedStages, onCardClick }: ProfilingCardGridProps) {
  return (
    <>
      <style>{`
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        padding: "16px",
      }}>
        {ALL_STAGES.map((stage, i) => {
          const isDone = completedStages.has(stage.id)
          const isRunning = activeStage === stage.id
          const status = isDone ? "done" : isRunning ? "running" : "pending"
          return (
            <div
              key={stage.id}
              style={{
                animation: `cardEntrance 0.35s ease both`,
                animationDelay: `${i * 60}ms`,
              }}
            >
              <ProfilingCard
                title={stage.title}
                status={status}
                summary={completedStages.get(stage.id)}
                isSelected={selectedStage === stage.id}
                onClick={() => onCardClick?.(stage.id)}
              />
            </div>
          )
        })}
      </div>
    </>
  )
}
