"use client"

import { useState, useCallback, memo } from "react"
import { RefreshCw, ChevronLeft, ChevronRight, Table, BarChart3 } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { cn } from "../../../lib/utils"
import { UsageCharts } from "./usage-charts"
import type { UsageFilterMode, RecentUsageEntry } from "../../../../types/usage"

type ViewMode = "table" | "charts"
const VIEW_MODE_STORAGE_KEY = "1code:recentUsagesViewMode"

const FILTER_MODE_STORAGE_KEY = "1code:recentUsagesFilterMode"
const PAGE_SIZE = 50

// Helper functions
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`
  }
  return `$${cost.toFixed(4)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toString()
}

function formatTimestamp(timestamp: Date | string): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatModel(model: string): string {
  // Note: More specific patterns must come before general ones
  if (model.includes("claude-3-5-sonnet")) return "Sonnet 3.5"
  if (model.includes("claude-3-opus")) return "Opus 3"
  if (model.includes("claude-3-sonnet")) return "Sonnet 3"
  if (model.includes("claude-3-haiku")) return "Haiku 3"
  if (model.includes("claude-sonnet-4-5")) return "Sonnet 4.5"
  if (model.includes("claude-sonnet-4")) return "Sonnet 4"
  if (model.includes("claude-opus-4-5")) return "Opus 4.5"
  if (model.includes("claude-opus-4")) return "Opus 4"
  if (model.includes("claude-haiku-4")) return "Haiku 4"

  if (model.length > 20) {
    const parts = model.split("-")
    return parts.slice(-2).join("-")
  }

  return model
}

function getStoredFilterMode(): UsageFilterMode {
  try {
    const stored = localStorage.getItem(FILTER_MODE_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (["session", "monthly", "year", "lastMonth"].includes(parsed.type)) {
        return parsed
      }
    }
  } catch {
    // localStorage not available or invalid JSON
  }
  return { type: "session" }
}

function storeFilterMode(mode: UsageFilterMode): void {
  try {
    localStorage.setItem(FILTER_MODE_STORAGE_KEY, JSON.stringify(mode))
  } catch {
    // localStorage not available
  }
}

function getStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (stored === "table" || stored === "charts") {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return "table"
}

function storeViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // localStorage not available
  }
}

function getFilterModeLabel(mode: UsageFilterMode): string {
  switch (mode.type) {
    case "session":
      return "This Session"
    case "monthly":
      return "This Month"
    case "year":
      return "This Year"
    case "lastMonth":
      return "Last Month"
    case "custom":
      return "Custom"
  }
}

function getEmptyStateMessage(mode: UsageFilterMode): string {
  switch (mode.type) {
    case "session":
      return "No usage since app started"
    case "monthly":
      return "No usage this month"
    case "year":
      return "No usage this year"
    case "lastMonth":
      return "No usage last month"
    case "custom":
      return "No usage in selected date range"
  }
}

interface UsageRowProps {
  entry: RecentUsageEntry
}

const UsageRow = memo(function UsageRow({ entry }: UsageRowProps) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-xs">
            {formatTimestamp(entry.timestamp)}
          </span>
          {entry.projectName && (
            <span
              className="text-muted-foreground text-[10px] font-mono truncate max-w-[100px]"
              title={entry.projectName}
            >
              {entry.projectName}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className="text-muted-foreground text-xs font-mono">
          {formatModel(entry.model)}
        </span>
      </td>
      <td className="hidden sm:table-cell py-2.5 px-3 text-right">
        <span className="text-foreground text-xs font-mono">
          {formatTokens(
            entry.inputTokens + entry.cacheCreationTokens + entry.cacheReadTokens
          )}
        </span>
      </td>
      <td className="hidden sm:table-cell py-2.5 px-3 text-right">
        <span className="text-foreground text-xs font-mono">
          {formatTokens(entry.outputTokens)}
        </span>
      </td>
      <td className="hidden md:table-cell py-2.5 px-3 text-right">
        {entry.cacheCreationTokens > 0 || entry.cacheReadTokens > 0 ? (
          <span className="text-cyan-500 text-xs font-mono">
            {formatTokens(entry.cacheReadTokens)}
          </span>
        ) : (
          <span className="text-muted-foreground/50 text-xs">-</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right">
        <span
          className={cn(
            "text-xs font-mono",
            entry.cost > 0.01 ? "text-amber-500" : "text-muted-foreground"
          )}
        >
          {formatCost(entry.cost)}
        </span>
      </td>
    </tr>
  )
})

interface RecentUsagesPanelProps {
  className?: string
}

export const RecentUsagesPanel = memo(function RecentUsagesPanel({
  className,
}: RecentUsagesPanelProps) {
  const [filterMode, setFilterMode] = useState<UsageFilterMode>(getStoredFilterMode)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode)

  const {
    data,
    isLoading,
    refetch,
    dataUpdatedAt,
  } = trpc.usage.getRecentUsages.useQuery(
    {
      page: currentPage,
      pageSize: PAGE_SIZE,
      filterMode,
    },
    {
      refetchInterval: 60 * 1000, // 60 seconds
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
    }
  )

  // Fetch chart data when in charts view
  const {
    data: chartData,
    isLoading: isChartLoading,
    refetch: refetchChart,
  } = trpc.usage.getChartData.useQuery(
    { filterMode },
    {
      enabled: viewMode === "charts",
      refetchInterval: 60 * 1000,
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
    }
  )

  const resetSessionMutation = trpc.usage.resetSession.useMutation({
    onSuccess: () => {
      refetch()
      if (viewMode === "charts") {
        refetchChart()
      }
    },
  })

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    storeViewMode(mode)
  }, [])

  const handleFilterModeChange = useCallback((value: string) => {
    // "custom" mode requires a range, but we don't support it from the dropdown
    // So we only allow non-custom modes here
    const type = value as Exclude<UsageFilterMode["type"], "custom">
    const mode: UsageFilterMode = { type }
    setFilterMode(mode)
    storeFilterMode(mode)
    setCurrentPage(1)
  }, [])

  const handleResetSession = useCallback(() => {
    resetSessionMutation.mutate()
  }, [resetSessionMutation])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // Format "last sync" time
  const lastSync = dataUpdatedAt
    ? formatLastSync(dataUpdatedAt)
    : null

  return (
    <div
      className={cn(
        "bg-background rounded-lg border border-border overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-foreground">Recent Usage</h3>
          <p className="text-xs text-muted-foreground">
            {data ? (
              <>
                Token usage & costs
                {lastSync && <> · Updated {lastSync}</>}
              </>
            ) : isLoading ? (
              "Loading..."
            ) : (
              "No data"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange("table")}
              className={cn(
                "h-7 w-7 p-0 rounded-r-none",
                viewMode === "table" && "bg-muted"
              )}
              title="Table view"
            >
              <Table className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange("charts")}
              className={cn(
                "h-7 w-7 p-0 rounded-l-none border-l border-border",
                viewMode === "charts" && "bg-muted"
              )}
              title="Charts view"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Filter Select */}
          <Select value={filterMode.type} onValueChange={handleFilterModeChange}>
            <SelectTrigger className="h-7 w-[120px] text-xs whitespace-nowrap">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="session">This Session</SelectItem>
              <SelectItem value="monthly">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
            </SelectContent>
          </Select>

          {/* Reset Session Button (only show in session mode) */}
          {filterMode.type === "session" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetSession}
              disabled={resetSessionMutation.isPending}
              className="h-7 text-xs px-2"
              title="Reset session start time"
            >
              Reset
            </Button>
          )}

          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => viewMode === "charts" ? refetchChart() : refetch()}
            disabled={viewMode === "charts" ? isChartLoading : isLoading}
            className="h-7 w-7 p-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (viewMode === "charts" ? isChartLoading : isLoading) && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "charts" ? (
        // Charts View
        <div className="p-4 space-y-4">
          {/* Total Cost */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {getFilterModeLabel(filterMode)} Cost
            </span>
            <span className="text-sm font-mono font-semibold text-amber-500">
              {formatCost(chartData?.totalCost ?? 0)}
            </span>
          </div>

          <UsageCharts
            entries={chartData?.entries ?? []}
            filterMode={filterMode}
            isLoading={isChartLoading}
          />
        </div>
      ) : data ? (
        // Table View
        <div className="p-4 space-y-4">
          {/* Total Cost */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {getFilterModeLabel(filterMode)} Cost
            </span>
            <span className="text-sm font-mono font-semibold text-amber-500">
              {formatCost(data.totalCost)}
            </span>
          </div>

          {/* Table or Empty State */}
          {data.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-1">
              <span className="text-muted-foreground text-sm">
                {getEmptyStateMessage(filterMode)}
              </span>
              <span className="text-muted-foreground/70 text-xs">
                Usage will appear here as you use Claude
              </span>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto -mx-4">
                <table className="w-full min-w-[300px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Time
                      </th>
                      <th className="text-left py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Model
                      </th>
                      <th className="hidden sm:table-cell text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Input
                      </th>
                      <th className="hidden sm:table-cell text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Output
                      </th>
                      <th className="hidden md:table-cell text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Cache
                      </th>
                      <th className="text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => (
                      <UsageRow key={entry.id} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-muted-foreground text-xs">
                    {(data.page - 1) * data.pageSize + 1}-
                    {Math.min(data.page * data.pageSize, data.totalCount)} of{" "}
                    {data.totalCount}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <span className="text-xs text-muted-foreground px-2">
                      {data.page} / {data.totalPages}
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= data.totalPages}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading usage data..." : "Unable to load usage data."}
          </p>
        </div>
      )}
    </div>
  )
})

/**
 * Format the "last sync" time relative to now
 */
function formatLastSync(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 1) return "just now"
  if (diffMinutes === 1) return "1 min ago"
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours === 1) return "1 hour ago"
  return `${diffHours} hours ago`
}
