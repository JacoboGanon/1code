"use client"

import { memo } from "react"
import { RefreshCw } from "lucide-react"
import { useUsage, formatTimeRemaining } from "../hooks/use-usage"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"

/**
 * Get color class based on usage percentage
 */
function getColorClass(percent: number): string {
  if (percent >= 80) return "text-red-500"
  if (percent >= 50) return "text-yellow-500"
  return "text-emerald-500"
}

/**
 * Get background color class for progress bar
 */
function getProgressBgClass(percent: number): string {
  if (percent >= 80) return "bg-red-500"
  if (percent >= 50) return "bg-yellow-500"
  return "bg-emerald-500"
}

interface ProgressBarProps {
  percent: number
  className?: string
}

function ProgressBar({ percent, className }: ProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent))

  return (
    <div
      className={cn(
        "h-2 w-full rounded-full bg-muted overflow-hidden",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          getProgressBgClass(percent)
        )}
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  )
}

interface UsageCardProps {
  className?: string
}

/**
 * Full usage card for settings tab
 * Shows session (5h) and weekly (7d) usage with progress bars and reset times
 */
export const UsageCard = memo(function UsageCard({ className }: UsageCardProps) {
  const { data: usage, isLoading, refetch, dataUpdatedAt } = useUsage()

  // Calculate "last sync" time
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
          <h3 className="text-sm font-semibold text-foreground">Claude Usage</h3>
          <p className="text-xs text-muted-foreground">
            {usage ? (
              <>
                Connected
                {lastSync && <> · Last sync: {lastSync}</>}
              </>
            ) : isLoading ? (
              "Loading..."
            ) : (
              "Not connected"
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="h-8 w-8 p-0"
        >
          <RefreshCw
            className={cn("h-4 w-4", isLoading && "animate-spin")}
          />
        </Button>
      </div>

      {/* Content */}
      {usage ? (
        <div className="p-4 space-y-5">
          {/* Session Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Session window
              </span>
              <span
                className={cn(
                  "text-sm font-mono font-medium",
                  getColorClass(usage.sessionUsagePercent)
                )}
              >
                {usage.sessionUsagePercent.toFixed(0)}%
              </span>
            </div>
            <ProgressBar percent={usage.sessionUsagePercent} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>5h rolling</span>
              {usage.sessionResetTime && (
                <span>resets in {formatTimeRemaining(usage.sessionResetTime)}</span>
              )}
            </div>
          </div>

          {/* Weekly Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Weekly capacity
              </span>
              <span
                className={cn(
                  "text-sm font-mono font-medium",
                  getColorClass(usage.weeklyUsagePercent)
                )}
              >
                {usage.weeklyUsagePercent.toFixed(0)}%
              </span>
            </div>
            <ProgressBar percent={usage.weeklyUsagePercent} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>7d rolling</span>
              {usage.weeklyResetTime && (
                <span>resets in {formatTimeRemaining(usage.weeklyResetTime)}</span>
              )}
            </div>
          </div>

          {/* Subscription info */}
          {usage.subscriptionType && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Plan: <span className="text-foreground font-medium">{usage.subscriptionType}</span>
                {usage.rateLimitTier && (
                  <> · Tier: <span className="text-foreground">{usage.rateLimitTier}</span></>
                )}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading usage data..."
              : "Connect an Anthropic account to view usage."}
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
