import { trpc } from "../../../lib/trpc"

/**
 * Hook to fetch Claude API usage data
 * Polls every 60 seconds and refetches on window focus
 */
export function useUsage() {
  return trpc.usage.get.useQuery(undefined, {
    refetchInterval: 60 * 1000, // 60 seconds
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
  })
}

/**
 * Format time remaining until reset
 */
export function formatTimeRemaining(resetTime: string | null): string {
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
