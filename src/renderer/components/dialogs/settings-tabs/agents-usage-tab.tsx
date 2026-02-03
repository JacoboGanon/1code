import { useEffect, useState } from "react"
import { UsageCard, RecentUsagesPanel } from "../../../features/usage"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

export function AgentsUsageTab() {
  const isNarrowScreen = useIsNarrowScreen()

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Usage</h3>
          <p className="text-xs text-muted-foreground">
            Monitor your Claude API usage limits.
          </p>
        </div>
      )}

      {/* Usage Card - Rate Limits from Anthropic API */}
      <UsageCard />

      {/* Recent Usages Panel - Local JSONL file tracking */}
      <RecentUsagesPanel />

      {/* Info section */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded space-y-2">
        <p className="font-medium">About Usage Tracking:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>Rate limits (above):</strong> Rolling 5-hour and 7-day usage limits from Anthropic API.
          </li>
          <li>
            <strong>Recent usage (below):</strong> Individual API calls with token counts and costs from local logs.
          </li>
          <li>
            Costs are calculated using LiteLLM pricing data (cached hourly).
          </li>
          <li>
            Data refreshes every 60 seconds or when you focus this window.
          </li>
        </ul>
      </div>
    </div>
  )
}
