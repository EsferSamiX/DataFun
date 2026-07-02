"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  getProfile,
  preprocessProfile,
  suggestPipelineModels,
  trainPipelineModels,
  getTrainedModels,
  runInference,
  patchProfileTarget,
} from "@/lib/api"
import type { ProfileResult, SuggestionResult, TrainedModelResult, InferenceResult } from "@/lib/api"
import StepBar, { PipelineStep } from "@/components/pipeline/StepBar"
import ProfileStep from "@/components/pipeline/ProfileStep"
import PreprocessStep from "@/components/pipeline/PreprocessStep"
import SuggestStep from "@/components/pipeline/SuggestStep"
import TrainStep from "@/components/pipeline/TrainStep"
import InferStep from "@/components/pipeline/InferStep"
import AppSidebar from "@/components/shared/AppSidebar"

export default function PipelinePage() {
  const params = useParams()
  const router = useRouter()
  const profileId = params.id as string

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileResult | null>(null)
  const [hasRawData, setHasRawData] = useState(true)
  const [preprocessedProfile, setPreprocessedProfile] = useState<ProfileResult | null>(null)
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null)
  const [trainedModels, setTrainedModels] = useState<TrainedModelResult[]>([])
  const [selectedInferModel, setSelectedInferModel] = useState<TrainedModelResult | null>(null)

  const [step, setStep] = useState<PipelineStep>("profile")
  const [completed, setCompleted] = useState<Set<PipelineStep>>(new Set())

  const [targetColumn, setTargetColumn] = useState<string>("")
  const [taskType, setTaskType] = useState<string>("")
  const [timeColumn, setTimeColumn] = useState<string>("")

  const [isApplying, setIsApplying] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isTraining, setIsTraining] = useState(false)
  const [pendingModelNames, setPendingModelNames] = useState<string[]>([])

  const [error, setError] = useState<string | null>(null)

  const markDone = (s: PipelineStep) => {
    setCompleted((prev) => new Set([...prev, s]))
  }

  useEffect(() => {
    async function load() {
      try {
        const p = await getProfile(profileId)
        setProfile(p)
        setHasRawData(p.has_raw_data !== false)
        markDone("profile")
        const ta = (p as any).target_analysis
        if (ta?.column) setTargetColumn(ta.column)
        if (ta?.task_type) setTaskType(ta.task_type)
        if (ta?.time_column) setTimeColumn(ta.time_column)

        // Load any already-trained models
        try {
          const trained = await getTrainedModels(profileId)
          if (trained.models.length > 0) {
            setTrainedModels(trained.models)
            markDone("preprocess")
            markDone("reprofile")
            markDone("suggest")
            markDone("train")
            setStep("train")
          }
        } catch {
          // no trained models yet, that's fine
        }
      } catch {
        router.replace("/")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onTargetConfirm = useCallback(async (column: string, type: string, timeCol?: string) => {
    await patchProfileTarget(profileId, column, type, timeCol)
    setTargetColumn(column)
    setTaskType(type)
    setTimeColumn(timeCol ?? "")
    // Patch profile state so Target Analysis card re-renders immediately
    const patchTA = (prev: ProfileResult | null): ProfileResult | null => {
      if (!prev) return prev
      const col = prev.columns?.find((c) => c.name === column)
      const classDistribution = col?.top_values?.map((tv) => ({
        label: String(tv.value),
        count: tv.count,
        pct: tv.pct,
      })) ?? []
      return {
        ...prev,
        target_analysis: {
          ...(prev.target_analysis ?? {}),
          column,
          task_type: type as any,
          ...(timeCol ? { time_column: timeCol } : {}),
          class_distribution: classDistribution,
          imbalance_ratio: undefined,
          imbalance_severity: undefined,
        },
      }
    }
    setProfile(patchTA)
    setPreprocessedProfile(patchTA)
  }, [profileId])

  const handlePreprocess = useCallback(async (ops: { op: string; columns?: string[] }[]) => {
    setIsApplying(true)
    setError(null)
    try {
      const result = await preprocessProfile(profileId, ops)
      // If a target override was already confirmed, apply it to the fresh preprocessed profile
      // so the re-profile step doesn't resurrect the stale precomputed PNG
      setProfile((prev) => {
        const base = result.profile
        const confirmedCol = prev?.target_analysis?.column
        if (!confirmedCol) return base
        const colStats = base.columns?.find((c) => c.name === confirmedCol)
        return {
          ...base,
          target_analysis: {
            ...(base.target_analysis ?? {}),
            column: (prev?.target_analysis as any)?.column,
            task_type: (prev?.target_analysis?.task_type ?? base.target_analysis?.task_type) as any,
            class_distribution: colStats?.top_values?.map((tv) => ({ label: String(tv.value), count: tv.count, pct: tv.pct })) ?? [],
            imbalance_ratio: undefined,
            imbalance_severity: undefined,
          },
          plots: { ...(base.plots ?? {}), target_distribution: null },
        }
      })
      setPreprocessedProfile((_prev) => {
        const base = result.profile
        // Use the current confirmed target from the profile state we just set above
        // We read targetColumn/taskType from the closure — they're captured at call time
        if (!targetColumn) return base
        const colStats = base.columns?.find((c) => c.name === targetColumn)
        return {
          ...base,
          target_analysis: {
            ...(base.target_analysis ?? {}),
            column: targetColumn,
            task_type: taskType as any,
            class_distribution: colStats?.top_values?.map((tv) => ({ label: String(tv.value), count: tv.count, pct: tv.pct })) ?? [],
            imbalance_ratio: undefined,
            imbalance_severity: undefined,
          },
          plots: { ...(base.plots ?? {}), target_distribution: null },
        }
      })
      markDone("preprocess")
      markDone("reprofile")
      setStep("reprofile")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preprocessing failed")
    } finally {
      setIsApplying(false)
    }
  }, [profileId, targetColumn, taskType])

  const handleSuggest = useCallback(async () => {
    setIsSuggesting(true)
    setError(null)
    try {
      const result = await suggestPipelineModels(profileId, 5, targetColumn || undefined)
      setSuggestion(result)
      markDone("suggest")
      setStep("suggest")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggestion failed")
    } finally {
      setIsSuggesting(false)
    }
  }, [profileId])

  const handleTrain = useCallback(async (modelNames: string[]) => {
    setIsTraining(true)
    setPendingModelNames(modelNames)
    setError(null)
    setStep("train")
    try {
      const result = await trainPipelineModels(profileId, modelNames, targetColumn || undefined)
      setTrainedModels(result.models)
      markDone("train")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Training failed")
    } finally {
      setIsTraining(false)
      setPendingModelNames([])
    }
  }, [profileId])

  const handleInfer = useCallback(async (
    featureValues: Record<string, unknown>
  ): Promise<InferenceResult> => {
    if (!selectedInferModel) throw new Error("No model selected")
    return runInference(selectedInferModel.model_id, featureValues)
  }, [selectedInferModel])

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#0a0a0a", color: "#6b7280",
      }}>
        Loading pipeline…
      </div>
    )
  }

  if (!profile) return null

  const currentProfile = preprocessedProfile ?? profile

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a", overflow: "hidden" }}>
      <AppSidebar />

      {/* Right: step bar + content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar: filename */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", height: "48px",
          background: "#080808", borderBottom: "1px solid #111",
          flexShrink: 0,
        }}>
          <span style={{ color: "#f9fafb", fontSize: "16px", fontWeight: 700 }}>
            {profile.file_name}
          </span>
        </div>

      {/* Step bar */}
      <StepBar current={step} completed={completed} />

      {/* Error banner */}
      {error && (
        <div style={{
          padding: "10px 28px",
          background: "rgba(239,68,68,0.1)", borderBottom: "1px solid rgba(239,68,68,0.2)",
          color: "#f87171", fontSize: "13px", flexShrink: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          {error}
          <button onClick={() => setError(null)} style={{
            background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "16px",
          }}>×</button>
        </div>
      )}

      {/* Main step content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {step === "profile" && (
          <ProfileStep
            profile={profile}
            onNext={() => setStep("preprocess")}
            nextLabel="Continue to Preprocess"
            targetColumn={targetColumn}
            taskType={taskType}
            timeColumn={timeColumn}
            onTargetConfirm={onTargetConfirm}
          />
        )}

        {step === "preprocess" && !hasRawData && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", gap: "16px", padding: "32px",
          }}>
            <div style={{ fontSize: "36px" }}>⚠</div>
            <h3 style={{ margin: 0, color: "#f9fafb", fontSize: "18px" }}>No file data stored</h3>
            <p style={{ color: "#6b7280", fontSize: "14px", textAlign: "center", maxWidth: "420px", margin: 0 }}>
              This profile was uploaded before preprocessing support was added.
              You can skip directly to model suggestions, or re-upload the file from the home page to enable preprocessing.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => { markDone("preprocess"); markDone("reprofile"); handleSuggest() }}
                style={{
                  background: "linear-gradient(135deg, #4f46e5, #7c3aed)", border: "none",
                  borderRadius: "10px", padding: "10px 22px", color: "#fff",
                  fontSize: "14px", fontWeight: 600, cursor: "pointer",
                }}
              >
                Skip to Model Suggestions →
              </button>
              <a href="/" style={{
                border: "1px solid #27272a", borderRadius: "10px", padding: "10px 22px",
                color: "#9ca3af", fontSize: "14px", textDecoration: "none",
                display: "flex", alignItems: "center",
              }}>
                Re-upload file
              </a>
            </div>
          </div>
        )}
        {step === "preprocess" && hasRawData && (
          <PreprocessStep
            profile={currentProfile}
            onApply={handlePreprocess}
            isApplying={isApplying}
            targetColumn={targetColumn || undefined}
            taskType={taskType || undefined}
            onSkip={() => {
              markDone("preprocess")
              markDone("reprofile")
              handleSuggest()
            }}
          />
        )}

        {step === "reprofile" && preprocessedProfile && (
          <ProfileStep
            profile={preprocessedProfile}
            label="Re-profiled Dataset"
            onNext={() => {
              if (suggestion) { setStep("suggest") }
              else { handleSuggest() }
            }}
            nextLabel={
              isSuggesting
                ? "Fetching suggestions…"
                : suggestion
                ? "View Model Suggestions"
                : "Get Model Suggestions"
            }
            targetColumn={targetColumn}
            taskType={taskType}
            timeColumn={timeColumn}
            onTargetConfirm={onTargetConfirm}
            lockedTarget
          />
        )}

        {step === "suggest" && suggestion && (
          <SuggestStep
            suggestion={suggestion}
            onTrain={handleTrain}
            isTraining={isTraining}
          />
        )}

        {step === "train" && (
          <TrainStep
            models={trainedModels}
            isTraining={isTraining}
            pendingModelNames={pendingModelNames}
            fileName={currentProfile?.file_name}
            onInfer={(model) => {
              setSelectedInferModel(model)
              markDone("infer")
              setStep("infer")
            }}
            onViewProfile={() => setStep("profile")}
          />
        )}

        {step === "infer" && selectedInferModel && (
          <InferStep
            model={selectedInferModel}
            featureColumns={currentProfile.columns}
            onPredict={handleInfer}
            onBack={() => setStep("train")}
          />
        )}
      </div>

      </div>{/* end right column */}
    </div>
  )
}
