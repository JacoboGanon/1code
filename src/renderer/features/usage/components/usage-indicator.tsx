"use client"

import { memo } from "react"
import { useUsage } from "../hooks/use-usage"
import { UsageCircle } from "./usage-circle"
import { cn } from "../../../lib/utils"

interface UsageIndicatorProps {
  className?: string
}

/**
 * Compact usage indicator showing session (5h) and weekly (7d) usage
 * Positioned in pane grid header
 */
export const UsageIndicator = memo(function UsageIndicator({
  className,
}: UsageIndicatorProps) {
  const { data: usage, isLoading } = useUsage()

  // Don't render if no data or loading
  if (isLoading || !usage) {
    return null
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <UsageCircle
        percent={usage.sessionUsagePercent}
        label="5h"
        resetTime={usage.sessionResetTime}
      />
      <UsageCircle
        percent={usage.weeklyUsagePercent}
        label="7d"
        resetTime={usage.weeklyResetTime}
      />
    </div>
  )
})
