"use client"

import { useMemo, memo } from "react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { cn } from "../../../lib/utils"
import type { RecentUsageEntry, UsageFilterMode } from "../../../../types/usage"

// Color palette for charts
const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  emerald: "#10b981",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  blue: "#3b82f6",
  orange: "#f97316",
  teal: "#14b8a6",
}

const MODEL_COLORS = [
  CHART_COLORS.amber,
  CHART_COLORS.cyan,
  CHART_COLORS.emerald,
  CHART_COLORS.violet,
  CHART_COLORS.rose,
  CHART_COLORS.blue,
]

const PROJECT_COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.emerald,
  CHART_COLORS.amber,
  CHART_COLORS.violet,
  CHART_COLORS.cyan,
  CHART_COLORS.rose,
  CHART_COLORS.orange,
  CHART_COLORS.teal,
]

interface TimeDataPoint {
  time: string
  displayTime: string
  cost: number
}

interface AggregatedDataPoint {
  name: string
  cost: number
  displayName: string
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

function formatModel(model: string): string {
  if (model.includes("claude-3-5-sonnet")) return "Sonnet 3.5"
  if (model.includes("claude-3-opus")) return "Opus 3"
  if (model.includes("claude-3-sonnet")) return "Sonnet 3"
  if (model.includes("claude-3-haiku")) return "Haiku 3"
  if (model.includes("claude-sonnet-4-5")) return "Sonnet 4.5"
  if (model.includes("claude-sonnet-4")) return "Sonnet 4"
  if (model.includes("claude-opus-4-5")) return "Opus 4.5"
  if (model.includes("claude-opus-4")) return "Opus 4"
  if (model.includes("claude-haiku-4")) return "Haiku 4"
  return model
}

function truncateProjectName(name: string, maxLen: number = 15): string {
  if (name.length <= maxLen) return name
  return name.slice(0, maxLen - 2) + "..."
}

/**
 * Aggregate entries by time bucket (hourly or daily depending on time range)
 */
function aggregateByTime(
  entries: RecentUsageEntry[],
  filterMode: UsageFilterMode
): TimeDataPoint[] {
  if (entries.length === 0) return []

  const now = new Date()
  const useHourly = filterMode.type === "session" || filterMode.type === "monthly"

  const buckets = new Map<string, number>()

  for (const entry of entries) {
    const date = new Date(entry.timestamp)
    let key: string
    let displayTime: string

    if (useHourly) {
      // Hourly buckets
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}`
      const isToday = date.toDateString() === now.toDateString()
      displayTime = isToday
        ? `${date.getHours()}:00`
        : `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`
    } else {
      // Daily buckets
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      displayTime = `${date.getMonth() + 1}/${date.getDate()}`
    }

    buckets.set(key, (buckets.get(key) || 0) + entry.cost)
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, cost]) => {
      const parts = time.split("-")
      const displayTime = useHourly
        ? `${parseInt(parts[1])}/${parseInt(parts[2])} ${parseInt(parts[3])}:00`
        : `${parseInt(parts[1])}/${parseInt(parts[2])}`
      return { time, displayTime, cost }
    })
}

/**
 * Aggregate entries by project
 */
function aggregateByProject(
  entries: RecentUsageEntry[],
  limit: number = 8
): AggregatedDataPoint[] {
  const projectCosts = new Map<string, number>()

  for (const entry of entries) {
    const project = entry.projectName || "Unknown"
    projectCosts.set(project, (projectCosts.get(project) || 0) + entry.cost)
  }

  return Array.from(projectCosts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, cost]) => ({
      name,
      cost,
      displayName: truncateProjectName(name),
    }))
}

/**
 * Aggregate entries by model
 */
function aggregateByModel(
  entries: RecentUsageEntry[],
  limit: number = 6
): AggregatedDataPoint[] {
  const modelCosts = new Map<string, number>()

  for (const entry of entries) {
    const model = formatModel(entry.model)
    modelCosts.set(model, (modelCosts.get(model) || 0) + entry.cost)
  }

  return Array.from(modelCosts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, cost]) => ({
      name,
      cost,
      displayName: name,
    }))
}

// Custom tooltip component
interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name?: string }>
  label?: string
}

const CustomTooltip = memo(function CustomTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-mono font-semibold text-foreground">
        {formatCost(payload[0].value)}
      </p>
    </div>
  )
})

interface ChartSectionProps {
  title: string
  children: React.ReactNode
  className?: string
}

const ChartSection = memo(function ChartSection({
  title,
  children,
  className,
}: ChartSectionProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </div>
  )
})

interface UsageChartsProps {
  entries: RecentUsageEntry[]
  filterMode: UsageFilterMode
  className?: string
  isLoading?: boolean
}

export const UsageCharts = memo(function UsageCharts({
  entries,
  filterMode,
  className,
  isLoading,
}: UsageChartsProps) {
  const timeData = useMemo(
    () => aggregateByTime(entries, filterMode),
    [entries, filterMode]
  )

  const projectData = useMemo(() => aggregateByProject(entries), [entries])

  const modelData = useMemo(() => aggregateByModel(entries), [entries])

  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="h-48 bg-muted/30 animate-pulse rounded-md" />
        <div className="h-48 bg-muted/30 animate-pulse rounded-md" />
        <div className="h-48 bg-muted/30 animate-pulse rounded-md" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-12 gap-2",
          className
        )}
      >
        <span className="text-muted-foreground text-sm">No data to display</span>
        <span className="text-muted-foreground/70 text-xs">
          Usage charts will appear here as you use Claude
        </span>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Cost over Time */}
      <ChartSection title="Cost over Time">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={timeData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.amber} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.amber} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="displayTime"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(value) => `$${value.toFixed(2)}`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="cost"
                stroke={CHART_COLORS.amber}
                strokeWidth={2}
                fill="url(#colorCost)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartSection>

      {/* Cost by Project */}
      {projectData.length > 0 && (
        <ChartSection title="Cost by Project">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={projectData}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={100}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {projectData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PROJECT_COLORS[index % PROJECT_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartSection>
      )}

      {/* Cost by Model */}
      {modelData.length > 0 && (
        <ChartSection title="Cost by Model">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={modelData}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {modelData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={MODEL_COLORS[index % MODEL_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartSection>
      )}
    </div>
  )
})
