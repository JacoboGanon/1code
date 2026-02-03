/**
 * Types for recent usage tracking
 */

// LiteLLM pricing data
export interface ModelPricing {
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_creation_input_token_cost?: number
  cache_read_input_token_cost?: number
  max_input_tokens?: number
  max_output_tokens?: number
  litellm_provider?: string
}

export interface LiteLLMPricingData {
  [modelName: string]: ModelPricing
}

// Recent usage entry
export interface RecentUsageEntry {
  id: string
  timestamp: Date
  provider: "claude"
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  totalTokens: number
  cost: number
  sessionId?: string
  projectName?: string
}

export interface DateRange {
  start: string // ISO date string "YYYY-MM-DD"
  end: string // ISO date string "YYYY-MM-DD"
}

export type UsageFilterMode =
  | { type: "session" }
  | { type: "monthly" }
  | { type: "year" }
  | { type: "lastMonth" }
  | { type: "custom"; range: DateRange }

export interface RecentUsagesData {
  entries: RecentUsageEntry[]
  totalCost: number
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  lastUpdated: Date
  filterMode: UsageFilterMode
  appStartedAt?: Date
}

// Chart aggregation data
export interface UsageChartData {
  entries: RecentUsageEntry[]
  totalCost: number
  totalCount: number
  lastUpdated: Date
  filterMode: UsageFilterMode
  appStartedAt?: Date
}
