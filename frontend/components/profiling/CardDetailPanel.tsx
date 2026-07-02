"use client"

import type { ProfileResult } from "@/lib/api"
import type { ProfilingStage } from "./ProfilingCardGrid"
import DatasetOverviewDetail from "./detail/DatasetOverviewDetail"
import MissingValuesDetail from "./detail/MissingValuesDetail"
import DuplicatesDetail from "./detail/DuplicatesDetail"
import ColumnStatsDetail from "./detail/ColumnStatsDetail"
import CorrelationDetail from "./detail/CorrelationDetail"
import QualityScoreDetail from "./detail/QualityScoreDetail"
import TargetAnalysisDetail from "./detail/TargetAnalysisDetail"
import RecommendationsDetail from "./detail/RecommendationsDetail"
import ColumnsDetail from "./detail/ColumnsDetail"

interface CardDetailPanelProps {
  stage: ProfilingStage
  profileResult: ProfileResult
  onClose: () => void
}

const STAGE_TITLES: Record<ProfilingStage, string> = {
  dataset_overview: "Dataset Overview",
  missing_values: "Missing Values",
  duplicates: "Duplicate Detection",
  column_statistics: "Column Statistics",
  correlations: "Correlation Analysis",
  quality_score: "Quality Score",
  target_analysis: "Target Analysis",
  recommendations: "Recommendations",
  columns: "Columns",
}

export default function CardDetailPanel({ stage, profileResult, onClose }: CardDetailPanelProps) {
  function renderDetail() {
    switch (stage) {
      case "dataset_overview": return <DatasetOverviewDetail profile={profileResult} />
      case "missing_values": return <MissingValuesDetail profile={profileResult} />
      case "duplicates": return <DuplicatesDetail profile={profileResult} />
      case "column_statistics": return <ColumnStatsDetail profile={profileResult} />
      case "correlations": return <CorrelationDetail profile={profileResult} />
      case "quality_score": return <QualityScoreDetail profile={profileResult} />
      case "target_analysis": return <TargetAnalysisDetail profile={profileResult} />
      case "recommendations": return <RecommendationsDetail profile={profileResult} />
      case "columns": return <ColumnsDetail profile={profileResult} />
    }
  }

  return (
    <div style={{
      background: "#1a1a1a",
      border: "1px solid #2a2a2a",
      borderRadius: "12px",
      margin: "12px 0",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: "1px solid #2a2a2a",
        background: "#161616",
      }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#e5e7eb" }}>
          {STAGE_TITLES[stage]}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: "20px",
            lineHeight: 1,
            padding: "2px 6px",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: "20px" }}>
        {renderDetail()}
      </div>
    </div>
  )
}
