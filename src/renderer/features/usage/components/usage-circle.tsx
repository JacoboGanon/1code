"use client"

import { memo } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"

interface UsageCircleProps {
  percent: number
  label: "5h" | "7d"
  resetTime?: string | null
  className?: string
}

/**
 * Get color class based on usage percentage
 */
function getColorClass(percent: number): string {
  if (percent >= 80) return "text-red-500"
  if (percent >= 50) return "text-yellow-500"
  return "text-emerald-500"
}

/**
 * Circular progress component for usage indicator
 */
function CircularProgress({
  percent,
  size = 14,
  strokeWidth = 2.5,
  className,
}: {
  percent: number
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, percent) / 100) * circumference
  const colorClass = getColorClass(percent)

  return (
    <svg
      width={size}
      height={size}
      className={cn("transform -rotate-90", className)}
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={cn("transition-all duration-300", colorClass)}
      />
    </svg>
  )
}

/**
 * Format time remaining for tooltip
 */
function formatTimeRemaining(resetTime: string | null): string {
  if (!resetTime) return ""

  const now = new Date()
  const reset = new Date(resetTime)
  const diffMs = reset.getTime() - now.getTime()

  if (diffMs <= 0) return "now"

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export const UsageCircle = memo(function UsageCircle({
  percent,
  label,
  resetTime,
  className,
}: UsageCircleProps) {
  const labelText = label === "5h" ? "Session" : "Weekly"
  const timeRemaining = formatTimeRemaining(resetTime ?? null)

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1 cursor-default",
            className
          )}
        >
          <CircularProgress percent={percent} size={14} strokeWidth={2.5} />
          <span className="text-[10px] font-medium text-muted-foreground">
            {label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        <p className="text-xs">
          <span className="font-medium">{labelText}:</span>{" "}
          <span className={cn("font-mono", getColorClass(percent))}>
            {percent.toFixed(0)}%
          </span>
          {timeRemaining && (
            <span className="text-muted-foreground ml-1">
              (resets in {timeRemaining})
            </span>
          )}
        </p>
      </TooltipContent>
    </Tooltip>
  )
})
