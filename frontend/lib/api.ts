import { getAuthHeader } from "./auth"

const API_BASE = ""

export interface ProfilePlots {
  column_distributions?: Record<string, string>  // col name → base64 PNG
  correlation_heatmap?: string | null
  missing_values_chart?: string | null
  target_distribution?: string | null
}

export interface ProfileResult {
  profile_id?: string
  file_name?: string
  num_rows: number
  num_columns: number
  memory_mb?: number
  memory_usage_bytes?: number
  file_format?: string
  missing_cells: number
  missing_cells_pct: number
  duplicate_rows: number
  duplicate_rows_pct: number
  // quality_score can be a number (old) or an object (new backend shape)
  quality_score?: number | { overall: number; grade: string; completeness: number; uniqueness: number; consistency: number; validity: number }
  quality_grade?: "A" | "B" | "C" | "D"
  columns: ColumnInfo[]
  correlations: CorrelationPair[]
  quality_breakdown?: QualityBreakdown
  target_analysis?: TargetAnalysis
  recommendations: Recommendation[]
  warnings?: string[]
  plots?: ProfilePlots
}

export interface ColumnInfo {
  name: string
  dtype: string
  type: string          // "float" | "integer" | "boolean" | "string" | "categorical" | "datetime" | "array" | "nested_object"
  kind?: "numeric" | "categorical" | "datetime"  // legacy — use type instead
  missing_count: number
  missing_pct: number
  unique_count: number
  // numeric
  min?: number
  max?: number
  mean?: number
  std?: number
  skewness?: number
  p25?: number
  p50?: number
  p75?: number
  // categorical
  mode?: string
  top_values?: { value: string; count: number; pct: number }[]
  entropy?: number
  // datetime
  min_date?: string
  max_date?: string
  span_days?: number
}

export interface CorrelationPair {
  col1: string
  col2: string
  correlation: number
  method: string
  p_value: number
  significant: boolean
}

export interface QualityBreakdown {
  completeness: number
  uniqueness: number
  consistency: number
  validity: number
}

export interface TargetAnalysis {
  column?: string
  task_type: "regression" | "binary_classification" | "multiclass_classification" | "clustering" | "time_series" | "anomaly_detection"
  time_column?: string
  class_distribution?: { label: string; count: number; pct: number }[]
  imbalance_ratio?: number
  imbalance_severity?: "none" | "mild" | "moderate" | "severe"
  recommended_strategy?: string
  top_correlated_features?: { name: string; correlation: number }[]
  leakage_candidates?: string[]
}

export interface Recommendation {
  priority: "HIGH" | "MEDIUM" | "LOW"
  message: string
  action: string
  category?: string
  impact?: "high" | "medium" | "low"
  effort?: "high" | "medium" | "low"
}

export interface ModelSuggestion {
  rank: number
  algorithm: string
  framework: string
  reason: string
  strengths: string[]
  weaknesses: string[]
  complexity: "low" | "medium" | "high"
  training_speed: "fast" | "medium" | "slow"
  suggested_params?: Record<string, unknown>
  trainable?: boolean
}

export interface SuggestionResult {
  task_type: string
  problem_summary: string
  suggestions: ModelSuggestion[]
  starter_code?: string
  concerns: string[]
  evaluation_metrics: string[]
  preprocessing_steps: string[]
}

export interface TrainedModelResult {
  model_id: string
  model_name: string
  task_type: string
  metrics: Record<string, number>
  target_classes?: string[]
  feature_names: string[]
  confusion_matrix_png?: string | null
  feature_importance_png?: string | null
  training_time_s?: number | null
  error?: string | null
  created_at?: string
  // new fields
  target_column?: string | null
  test_rows?: Record<string, unknown>[] | null
  roc_curve_png?: string | null
  residual_plot_png?: string | null
  ts_actual_vs_predicted_png?: string | null
  learning_curve_png?: string | null
  classification_report_text?: string | null
}

export interface InferenceResult {
  model_id: string
  model_name: string
  task_type: string
  prediction: string | number
  probabilities?: Record<string, number> | null
  anomaly?: boolean | null
  cluster?: number | null
}

export interface HistoryItem {
  id: string
  file_name: string
  created_at: string
  num_rows: number
  num_columns: number
  quality_grade: "A" | "B" | "C" | "D"
  quality_score: number
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeader(),
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    let message = `Request failed: ${res.status}`
    try {
      const json = JSON.parse(text)
      if (typeof json?.detail === "string") {
        message = json.detail
      } else if (Array.isArray(json?.detail) && json.detail[0]?.msg) {
        message = json.detail[0].msg
      } else if (typeof json?.message === "string") {
        message = json.message
      }
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function signup(data: { full_name: string; email: string; password: string }) {
  return apiFetch<{ access_token: string }>("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export async function login(data: { email: string; password: string }) {
  return apiFetch<{ access_token: string }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export async function getProfile(id: string): Promise<ProfileResult & { has_raw_data?: boolean }> {
  const res = await apiFetch<{ profile_id: string; file_name: string; file_format: string; has_raw_data: boolean; result: ProfileResult }>(`/api/profile/${id}`)
  return { ...res.result, file_name: res.file_name, file_format: res.file_format, has_raw_data: res.has_raw_data }
}

export async function getSuggestion(id: string): Promise<SuggestionResult> {
  return apiFetch<SuggestionResult>(`/api/profile/${id}/suggest`)
}

export async function deleteProfile(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/profile/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() },
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.text()
    throw new Error(err || `Delete failed: ${res.status}`)
  }
}

export async function getHistory(): Promise<HistoryItem[]> {
  const res = await apiFetch<{ profiles: (Omit<HistoryItem, "id"> & { profile_id: string })[] }>("/api/profile/history")
  return res.profiles.map((p) => ({ ...p, id: p.profile_id }))
}

export async function getSimilar(id: string): Promise<HistoryItem[]> {
  return apiFetch<HistoryItem[]>(`/api/similar/${id}`)
}

export async function uploadProfile(
  file: File,
  targetColumn?: string
): Promise<{ profile_id: string; profile: ProfileResult; suggestion: SuggestionResult; cached: boolean }> {
  const form = new FormData()
  form.append("file", file)
  if (targetColumn) form.append("target_column", targetColumn)
  return apiFetch<{ profile_id: string; profile: ProfileResult; suggestion: SuggestionResult; cached: boolean }>("/api/profile", {
    method: "POST",
    body: form,
  })
}

// ── Pipeline API ──────────────────────────────────────────────────────────────

export async function preprocessProfile(
  profileId: string,
  operations: { op: string; columns?: string[]; value?: unknown }[]
): Promise<{ profile: ProfileResult; preprocessing: Record<string, unknown>; preview: Record<string, unknown>[] }> {
  return apiFetch(`/api/pipeline/${profileId}/preprocess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  })
}

export async function patchProfileTarget(
  profileId: string,
  targetColumn: string,
  taskType: string,
  timeColumn?: string,
): Promise<{ target_column: string; task_type: string; time_column: string | null }> {
  return apiFetch(`/api/profile/${profileId}/target`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_column: targetColumn, task_type: taskType, time_column: timeColumn ?? null }),
  })
}

export async function suggestPipelineModels(
  profileId: string,
  maxSuggestions = 5,
  targetColumn?: string,
): Promise<SuggestionResult & { suggestion_id: string; profile_id: string }> {
  return apiFetch(`/api/pipeline/${profileId}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_suggestions: maxSuggestions,
      ...(targetColumn ? { target_column: targetColumn } : {}),
    }),
  })
}

export async function trainPipelineModels(
  profileId: string,
  modelNames: string[],
  targetColumn?: string
): Promise<{ profile_id: string; models: TrainedModelResult[] }> {
  return apiFetch(`/api/pipeline/${profileId}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_names: modelNames, target_column: targetColumn }),
  })
}

export async function getTrainedModels(profileId: string): Promise<{ models: TrainedModelResult[] }> {
  return apiFetch(`/api/pipeline/${profileId}/models`)
}

export async function getMe(): Promise<{ id: string; email: string; full_name: string }> {
  return apiFetch("/api/auth/me")
}

export async function runInference(
  modelId: string,
  featureValues: Record<string, unknown>
): Promise<InferenceResult> {
  return apiFetch(`/api/pipeline/models/${modelId}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature_values: featureValues }),
  })
}

