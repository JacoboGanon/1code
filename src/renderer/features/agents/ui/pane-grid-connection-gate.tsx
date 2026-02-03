import { useAtomValue, useSetAtom } from "jotai"
import { AlertTriangle, Key, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import {
  customClaudeConfigAtom,
  normalizeCustomClaudeConfig,
  agentsSettingsDialogActiveTabAtom,
} from "@/lib/atoms"
import { desktopViewAtom } from "../atoms"

interface PaneGridConnectionGateProps {
  projectId: string
  children: React.ReactNode
}

export function PaneGridConnectionGate({
  projectId,
  children,
}: PaneGridConnectionGateProps) {
  const { data: status, isLoading } =
    trpc.claudeCode.getConnectionStatus.useQuery(undefined, {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    })

  // Check custom config from localStorage (client-side only)
  const customConfig = useAtomValue(customClaudeConfigAtom)
  const hasCustomConfig = !!normalizeCustomClaudeConfig(customConfig)

  const setDesktopView = useSetAtom(desktopViewAtom)
  const setSettingsTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  const openSettings = () => {
    setSettingsTab("models")
    setDesktopView("settings")
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  // Binary missing
  if (!status?.binaryExists) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Claude CLI Not Found</h2>
          <p className="text-muted-foreground text-sm">
            The Claude CLI binary is required to run chats. Please download it
            first.
          </p>
          <code className="block bg-muted px-3 py-2 rounded text-xs">
            bun run claude:download
          </code>
        </div>
      </div>
    )
  }

  // No credentials (check both server-side and client-side custom config)
  const hasAnyCredentials = status?.hasCredentials || hasCustomConfig

  if (!hasAnyCredentials) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Key className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Connect Your Account</h2>
          <p className="text-muted-foreground text-sm">
            Sign in with Anthropic or configure an API key to start using
            Claude.
          </p>
          <Button onClick={openSettings}>
            <Settings className="h-4 w-4 mr-2" />
            Open Settings
          </Button>
        </div>
      </div>
    )
  }

  // All good - render pane grid
  return <>{children}</>
}
