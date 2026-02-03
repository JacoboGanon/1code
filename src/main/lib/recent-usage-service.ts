import { readFile, readdir, stat } from "fs/promises"
import { join, basename, dirname } from "path"
import { homedir } from "os"
import type {
  RecentUsageEntry,
  RecentUsagesData,
  UsageChartData,
  LiteLLMPricingData,
  ModelPricing,
  UsageFilterMode,
} from "../../types/usage"

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"

// Cache for LiteLLM pricing data
let pricingCache: LiteLLMPricingData | null = null
let pricingCacheTime = 0
const PRICING_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// App start time for session filtering
let appStartTime: Date = new Date()

/**
 * Sets the app start time for session filtering
 */
export function setAppStartTime(time: Date): void {
  appStartTime = time
}

/**
 * Gets the app start time
 */
export function getAppStartTime(): Date {
  return appStartTime
}

/**
 * Gets all valid Claude data directories
 * Checks both XDG config path (~/.config/claude) and legacy path (~/.claude)
 */
function getClaudeProjectsDirs(): string[] {
  const dirs: string[] = []

  // Check environment variable first (supports comma-separated paths)
  const envPaths = (process.env.CLAUDE_CONFIG_DIR ?? "").trim()
  if (envPaths !== "") {
    const envPathList = envPaths
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "")
    for (const envPath of envPathList) {
      dirs.push(join(envPath, "projects"))
    }
    // If environment variable is set, only use those paths
    if (dirs.length > 0) {
      return dirs
    }
  }

  // XDG config path (new default): ~/.config/claude/projects
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  dirs.push(join(xdgConfigHome, "claude", "projects"))

  // Legacy path: ~/.claude/projects
  dirs.push(join(homedir(), ".claude", "projects"))

  return dirs
}

interface ClaudeJSONLEntry {
  type?: string
  message?: {
    id?: string // Message ID for deduplication
    role?: string
    model?: string
    stop_reason?: string | null
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  timestamp?: string
  costUSD?: number
  requestId?: string // Request ID for deduplication
  sessionId?: string
}

/**
 * Fetches LiteLLM pricing data with caching
 */
export async function fetchLiteLLMPricing(): Promise<LiteLLMPricingData> {
  const now = Date.now()

  if (pricingCache && now - pricingCacheTime < PRICING_CACHE_TTL_MS) {
    return pricingCache
  }

  try {
    const response = await fetch(LITELLM_PRICING_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.status}`)
    }

    pricingCache = (await response.json()) as LiteLLMPricingData
    pricingCacheTime = now
    return pricingCache
  } catch (error) {
    console.error("Failed to fetch LiteLLM pricing:", error)
    // Return cached data if available, even if stale
    if (pricingCache) {
      return pricingCache
    }
    // Return empty object if no cache available
    return {}
  }
}

/**
 * Gets pricing for a specific model
 */
function getModelPricing(
  pricing: LiteLLMPricingData,
  model: string
): ModelPricing | null {
  // Try exact match first
  if (pricing[model]) {
    return pricing[model]
  }

  // Try with provider prefix
  const claudeKey = `claude/${model}`
  if (pricing[claudeKey]) {
    return pricing[claudeKey]
  }

  // Try anthropic prefix
  const anthropicKey = `anthropic/${model}`
  if (pricing[anthropicKey]) {
    return pricing[anthropicKey]
  }

  // Try partial match for model names like "claude-3-5-sonnet-20241022"
  for (const key of Object.keys(pricing)) {
    if (
      key.includes(model) ||
      model.includes(key.replace("claude/", "").replace("anthropic/", ""))
    ) {
      return pricing[key]
    }
  }

  return null
}

/**
 * Calculates cost for a usage entry
 */
function calculateCost(
  pricing: LiteLLMPricingData,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number
): number {
  const modelPricing = getModelPricing(pricing, model)

  if (!modelPricing) {
    return 0
  }

  const inputCost = inputTokens * (modelPricing.input_cost_per_token || 0)
  const outputCost = outputTokens * (modelPricing.output_cost_per_token || 0)
  const cacheCreationCost =
    cacheCreationTokens *
    (modelPricing.cache_creation_input_token_cost ||
      modelPricing.input_cost_per_token ||
      0)
  const cacheReadCost =
    cacheReadTokens *
    (modelPricing.cache_read_input_token_cost ||
      modelPricing.input_cost_per_token ||
      0)

  return inputCost + outputCost + cacheCreationCost + cacheReadCost
}

/**
 * Recursively finds all JSONL files in a directory
 */
async function findJSONLFiles(
  dir: string,
  maxDepth = 5,
  currentDepth = 0
): Promise<string[]> {
  if (currentDepth >= maxDepth) return []

  const files: string[] = []

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        const subFiles = await findJSONLFiles(fullPath, maxDepth, currentDepth + 1)
        files.push(...subFiles)
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files
}

/**
 * Creates a unique hash for deduplication using message ID and request ID
 */
function createUniqueHash(entry: ClaudeJSONLEntry): string | null {
  const messageId = entry.message?.id
  const requestId = entry.requestId

  if (!messageId || !requestId) {
    return null
  }

  return `${messageId}:${requestId}`
}

/**
 * Parses a JSONL file and extracts usage entries
 */
async function parseClaudeJSONLFile(
  filePath: string,
  pricing: LiteLLMPricingData,
  processedHashes: Set<string> // Shared across files for deduplication
): Promise<RecentUsageEntry[]> {
  const entries: RecentUsageEntry[] = []

  try {
    const content = await readFile(filePath, "utf-8")
    const lines = content.split("\n").filter((line) => line.trim())

    // Extract project name from path
    const projectName = basename(dirname(filePath))
    const sessionId = basename(filePath, ".jsonl")

    for (const line of lines) {
      try {
        const entry: ClaudeJSONLEntry = JSON.parse(line)

        // Process entries with usage data
        const usage = entry.message?.usage
        const hasInputTokens = usage?.input_tokens != null && usage.input_tokens > 0
        const hasOutputTokens =
          usage?.output_tokens != null && usage.output_tokens > 0
        const hasUsageData = hasInputTokens || hasOutputTokens

        if (!hasUsageData) {
          continue
        }

        if (hasUsageData && usage) {
          // Deduplication check using message ID + request ID
          const uniqueHash = createUniqueHash(entry)
          if (uniqueHash) {
            if (processedHashes.has(uniqueHash)) {
              continue
            }
            processedHashes.add(uniqueHash)
          }

          const model = entry.message?.model || "unknown"

          const inputTokens = usage.input_tokens || 0
          const outputTokens = usage.output_tokens || 0
          const cacheCreationTokens = usage.cache_creation_input_tokens || 0
          const cacheReadTokens = usage.cache_read_input_tokens || 0
          const totalTokens =
            inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens

          // Use costUSD if available, otherwise calculate
          const cost =
            entry.costUSD ??
            calculateCost(
              pricing,
              model,
              inputTokens,
              outputTokens,
              cacheCreationTokens,
              cacheReadTokens
            )

          const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date()

          entries.push({
            id: `claude-${sessionId}-${entries.length}`,
            timestamp,
            provider: "claude",
            model,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            totalTokens,
            cost,
            sessionId,
            projectName,
          })
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (err) {
    console.error(`[RecentUsage] Error reading file ${filePath}:`, err)
  }

  return entries
}

/**
 * Gets the most recently modified JSONL files
 */
async function getMostRecentFiles(
  files: string[],
  limit: number
): Promise<string[]> {
  const fileStats = await Promise.all(
    files.map(async (file) => {
      try {
        const stats = await stat(file)
        return { file, mtime: stats.mtime.getTime() }
      } catch {
        return { file, mtime: 0 }
      }
    })
  )

  return fileStats
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((f) => f.file)
}

/**
 * Gets the start of the current month
 */
function getStartOfMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * Gets the start of the current year
 */
function getStartOfYear(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), 0, 1)
}

/**
 * Gets the date range for the previous month
 */
function getLastMonthRange(): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/**
 * Filters entries based on the filter mode
 */
function filterEntries(
  entries: RecentUsageEntry[],
  filterMode: UsageFilterMode
): RecentUsageEntry[] {
  let startTime: Date
  let endTime: Date | null = null

  switch (filterMode.type) {
    case "session":
      startTime = appStartTime
      break
    case "monthly":
      startTime = getStartOfMonth()
      break
    case "year":
      startTime = getStartOfYear()
      break
    case "lastMonth": {
      const range = getLastMonthRange()
      startTime = range.start
      endTime = range.end
      break
    }
    case "custom": {
      startTime = new Date(filterMode.range.start)
      startTime.setHours(0, 0, 0, 0)
      endTime = new Date(filterMode.range.end)
      endTime.setHours(23, 59, 59, 999)
      break
    }
  }

  return entries.filter((entry) => {
    const ts = entry.timestamp.getTime()
    if (ts < startTime.getTime()) return false
    if (endTime && ts > endTime.getTime()) return false
    return true
  })
}

/**
 * Fetches recent usage data from local JSONL files with pagination
 */
export async function getRecentUsages(
  page = 1,
  pageSize = 50,
  filterMode: UsageFilterMode = { type: "session" }
): Promise<RecentUsagesData> {
  const pricing = await fetchLiteLLMPricing()
  const allEntries: RecentUsageEntry[] = []

  // Get Claude usage from JSONL files (check all possible directories)
  try {
    const claudeDirs = getClaudeProjectsDirs()
    const allClaudeFiles: string[] = []

    // Collect files from all Claude directories
    for (const dir of claudeDirs) {
      try {
        const files = await findJSONLFiles(dir)
        allClaudeFiles.push(...files)
      } catch {
        // Directory not accessible
      }
    }

    // Sort files by modification time (most recent first) for better deduplication
    const sortedClaudeFiles = await getMostRecentFiles(
      allClaudeFiles,
      allClaudeFiles.length
    )

    // Shared set for deduplication across all files
    const processedHashes = new Set<string>()

    for (const file of sortedClaudeFiles) {
      const entries = await parseClaudeJSONLFile(file, pricing, processedHashes)
      allEntries.push(...entries)
    }
  } catch (error) {
    console.error("[RecentUsage] Error reading Claude usage files:", error)
  }

  // Sort by timestamp (most recent first)
  const sortedEntries = allEntries.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  )

  // Apply filter based on mode
  const filteredEntries = filterEntries(sortedEntries, filterMode)

  // Calculate total cost from filtered entries
  const totalCost = filteredEntries.reduce((sum, entry) => sum + entry.cost, 0)
  const totalCount = filteredEntries.length
  const totalPages = Math.ceil(totalCount / pageSize)

  // Paginate
  const startIndex = (page - 1) * pageSize
  const paginatedEntries = filteredEntries.slice(startIndex, startIndex + pageSize)

  return {
    entries: paginatedEntries,
    totalCost,
    totalCount,
    page,
    pageSize,
    totalPages,
    lastUpdated: new Date(),
    filterMode,
    appStartedAt: appStartTime,
  }
}

/**
 * Fetches all usage data for charts (no pagination)
 */
export async function getChartData(
  filterMode: UsageFilterMode = { type: "session" }
): Promise<UsageChartData> {
  const pricing = await fetchLiteLLMPricing()
  const allEntries: RecentUsageEntry[] = []

  // Get Claude usage from JSONL files (check all possible directories)
  try {
    const claudeDirs = getClaudeProjectsDirs()
    const allClaudeFiles: string[] = []

    // Collect files from all Claude directories
    for (const dir of claudeDirs) {
      try {
        const files = await findJSONLFiles(dir)
        allClaudeFiles.push(...files)
      } catch {
        // Directory not accessible
      }
    }

    // Sort files by modification time (most recent first) for better deduplication
    const sortedClaudeFiles = await getMostRecentFiles(
      allClaudeFiles,
      allClaudeFiles.length
    )

    // Shared set for deduplication across all files
    const processedHashes = new Set<string>()

    for (const file of sortedClaudeFiles) {
      const entries = await parseClaudeJSONLFile(file, pricing, processedHashes)
      allEntries.push(...entries)
    }
  } catch (error) {
    console.error("[RecentUsage] Error reading Claude usage files:", error)
  }

  // Sort by timestamp (most recent first)
  const sortedEntries = allEntries.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  )

  // Apply filter based on mode
  const filteredEntries = filterEntries(sortedEntries, filterMode)

  // Calculate total cost from filtered entries
  const totalCost = filteredEntries.reduce((sum, entry) => sum + entry.cost, 0)

  return {
    entries: filteredEntries,
    totalCost,
    totalCount: filteredEntries.length,
    lastUpdated: new Date(),
    filterMode,
    appStartedAt: appStartTime,
  }
}
