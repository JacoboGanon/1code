import { z } from "zod"
import { publicProcedure, router } from "../index"
import { getExistingClaudeCredentials } from "../../claude-token"
import {
  getRecentUsages,
  getChartData,
  setAppStartTime,
  getAppStartTime,
} from "../../recent-usage-service"
import type { UsageFilterMode } from "../../../../types/usage"

// Zod schema for filter mode
const dateRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
})

const filterModeSchema = z.union([
  z.object({ type: z.literal("session") }),
  z.object({ type: z.literal("monthly") }),
  z.object({ type: z.literal("year") }),
  z.object({ type: z.literal("lastMonth") }),
  z.object({ type: z.literal("custom"), range: dateRangeSchema }),
])

/**
 * Usage data shape from Anthropic API
 */
export interface UsageData {
  sessionUsagePercent: number
  weeklyUsagePercent: number
  sessionResetTime: string | null
  weeklyResetTime: string | null
  subscriptionType?: string
  rateLimitTier?: string
}

/**
 * tRPC router for Anthropic usage API
 */
export const usageRouter = router({
  /**
   * Get usage data from Anthropic API using Claude CLI credentials
   */
  get: publicProcedure.query(async (): Promise<UsageData | null> => {
    // Get credentials from Claude CLI (Keychain or credentials file)
    const credentials = getExistingClaudeCredentials()
    if (!credentials) {
      console.log("[Usage] No Claude CLI credentials found")
      return null
    }

    const token = credentials.accessToken

    // Fetch usage from Anthropic API
    try {
      const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
          "User-Agent": "claude-code/2.0.32",
        },
      })

      if (!response.ok) {
        console.error("[Usage] API error:", response.status, response.statusText)
        return null
      }

      const data = await response.json()

      // Parse the response - API returns utilization as 0-100 percentage
      return {
        sessionUsagePercent: data.five_hour?.utilization ?? 0,
        weeklyUsagePercent: data.seven_day?.utilization ?? 0,
        sessionResetTime: data.five_hour?.resets_at ?? null,
        weeklyResetTime: data.seven_day?.resets_at ?? null,
      }
    } catch (error) {
      console.error("[Usage] Failed to fetch usage:", error)
      return null
    }
  }),

  /**
   * Get recent usage entries from local JSONL files with pagination
   */
  getRecentUsages: publicProcedure
    .input(
      z.object({
        page: z.number().default(1),
        pageSize: z.number().default(50),
        filterMode: filterModeSchema.default({ type: "session" }),
      })
    )
    .query(async ({ input }) => {
      return getRecentUsages(
        input.page,
        input.pageSize,
        input.filterMode as UsageFilterMode
      )
    }),

  /**
   * Get all usage data for charts (no pagination)
   */
  getChartData: publicProcedure
    .input(
      z.object({
        filterMode: filterModeSchema.default({ type: "session" }),
      })
    )
    .query(async ({ input }) => {
      return getChartData(input.filterMode as UsageFilterMode)
    }),

  /**
   * Reset the session start time (for "This Session" filter)
   */
  resetSession: publicProcedure.mutation(async () => {
    setAppStartTime(new Date())
    return { appStartedAt: getAppStartTime() }
  }),

  /**
   * Get the current app start time
   */
  getAppStartTime: publicProcedure.query(async () => {
    return { appStartedAt: getAppStartTime() }
  }),
})
