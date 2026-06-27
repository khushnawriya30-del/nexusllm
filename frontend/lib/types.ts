// Shared TypeScript types mirroring the backend API contract.

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type ProviderCategory = "free" | "trial";

export interface ModelRateLimits {
  requests_per_minute?: number;
  requests_per_day?: number;
  tokens_per_minute?: number;
  tokens_per_day?: number;
  tokens_per_month?: number;
}

export interface ProviderModel {
  model_id: string;
  context_window: number | null;
  capabilities: string[];
  status: string;
  enabled?: boolean;
  avg_latency_ms: number | null;
  rate_limits: ModelRateLimits | null;
}

export interface ProviderStatus {
  id: string;
  name: string;
  category: ProviderCategory;
  enabled: boolean;
  key_count: number;
  circuit_state: CircuitState;
  model_count: number;
  models: ProviderModel[];
  daily_token_budget: number | null;
  daily_request_budget: number | null;
  avg_latency_ms: number | null;
  last_health_check: string | null;
  color: string;
  weight_percent: number;
  tags: string[];
}

export interface ProvidersResponse {
  providers: ProviderStatus[];
}

export interface NexusModelMeta {
  description?: string;
  providers: string[];
  underlying_models?: string[];
  capabilities: string[];
  context_window: number | null;
  rate_limits: ModelRateLimits | null;
}

export interface ModelListItem {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  "x-nexusllm": NexusModelMeta;
}

export interface ModelsResponse {
  object: "list";
  data: ModelListItem[];
}

export interface MetricsResponse {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_fallbacks: number;
  success_rate: number;
  tokens_used_today: number;
  requests_today: number;
  provider_stats: Record<
    string,
    { successes: number; failures: number; avg_latency_ms: number | null }
  >;
}

export interface RequestLogEntry {
  id: number;
  request_id: string;
  timestamp: string;
  model_requested: string | null;
  model_used: string | null;
  provider_used: string | null;
  total_latency_ms: number | null;
  fallback_count: number | null;
  status_code: number | null;
  error_reason: string | null;
  is_stream: boolean;
  attempts: Array<{
    provider: string;
    key_index: number;
    model: string;
    status: number | null;
    latency_ms: number;
    failure_class: string | null;
  }>;
}

export interface CircuitBreakerEntry {
  provider_id: string;
  key_index: number;
  state: CircuitState;
  failure_count: number;
  consecutive_open_trips: number;
  seconds_until_half_open: number | null;
}

export interface FusionModelState {
  slot: number;
  model: string;
  provider?: string;
  content: string;
  status: "thinking" | "done" | "error";
  error?: string;
}

export interface FusionState {
  models: FusionModelState[];
  contributors?: string[];
  judging: boolean;
  judgeProvider?: string;
  judgeModel?: string;
  elapsedMs?: number;
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  reasoning?: string;
  provider?: string;
  model?: string;
  error?: boolean;
  fusion?: FusionState;
  /** Image data-URLs attached to a user message (multimodal). */
  images?: string[];
}

export interface ChatParams {
  temperature: number;
  maxTokens: number;
  topP: number;
  stream: boolean;
}

export interface FallbackInfo {
  provider: string;
  model: string;
  requested: string;
  count: number;
}


// --- Keys management -------------------------------------------------------

export interface UnifiedKeyResponse {
  key: string;
  base_url: string;
  endpoints: {
    chat: string;
    completions: string;
    embeddings: string;
    models: string;
  };
}

export interface SupportedProvider {
  id: string;
  name: string;
  category: ProviderCategory;
  requires_key?: boolean;
  key_free?: boolean;
  get_key_url: string | null;
}

export interface ConfiguredKey {
  id: string;
  masked: string;
  label: string;
  enabled: boolean;
  status: string | null;
  latency_ms: number | null;
  last_checked: string | null;
}

export interface ProviderKeyGroup {
  provider_id: string;
  name: string;
  enabled: boolean;
  is_custom: boolean;
  requires_key?: boolean;
  key_free?: boolean;
  get_key_url: string | null;
  base_url?: string;
  models?: string[];
  key_count: number;
  keys: ConfiguredKey[];
}


// --- Analytics -------------------------------------------------------------

export interface AnalyticsOverview {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  error_rate: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  avg_latency_ms: number;
  estimated_cost: number;
  estimated_savings: number;
  active_providers: number;
  active_models: number;
}

export interface ProviderAnalytics {
  provider: string;
  requests: number;
  success_rate: number;
  error_rate: number;
  avg_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  estimated_savings: number;
}

export interface ModelAnalytics {
  model: string;
  provider: string | null;
  requests: number;
  successful: number;
  failed: number;
  success_rate: number;
  avg_latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  estimated_savings: number;
}

export interface SeriesPoint {
  t: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  successful: number;
  failed: number;
  latency_ms: number;
  cost: number;
  savings: number;
}

export interface NameValue {
  name: string;
  value: number;
}

export interface AnalyticsSeries {
  bucket_seconds: number;
  points: SeriesPoint[];
  by_provider: NameValue[];
  by_model: NameValue[];
  errors_by_type: NameValue[];
  errors_by_provider: NameValue[];
  success_vs_failed: NameValue[];
}

export interface AnalyticsError {
  provider: string | null;
  model: string | null;
  message: string;
  error_type: string;
  status_code: number | null;
  timestamp: string;
  request_id: string | null;
}

export interface AnalyticsResponse {
  range: string;
  overview: AnalyticsOverview;
  providers: ProviderAnalytics[];
  models: ModelAnalytics[];
  series: AnalyticsSeries;
  errors: AnalyticsError[];
}

export interface RequestRow {
  request_id: string | null;
  timestamp: string;
  provider: string | null;
  model: string | null;
  request_type: string;
  status: "success" | "failed";
  status_code: number | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  estimated_cost: number;
  estimated_savings: number;
}

export interface RequestsPage {
  items: RequestRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface AnalyticsFilters {
  range: string;
  provider?: string;
  model?: string;
  status?: "success" | "failed";
  request_type?: "chat" | "embeddings" | "completions";
  min_tokens?: number;
  max_tokens?: number;
}
