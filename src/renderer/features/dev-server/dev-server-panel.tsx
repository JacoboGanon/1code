import { useCallback, useMemo, useEffect, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { useTheme } from "next-themes"
import { ChevronsDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ResizableBottomPanel } from "@/components/ui/resizable-bottom-panel"
import { Terminal } from "../terminal/terminal"
import { getDefaultTerminalBg } from "../terminal/helpers"
import { fullThemeDataAtom } from "@/lib/atoms"
import { trpc } from "@/lib/trpc"
import {
  devServerPanelVisibleAtomFamily,
  devServerPanelHeightAtom,
  devServerStatusAtomFamily,
} from "./atoms"

interface DevServerPanelProps {
  projectId: string
  projectPath: string
}

export function DevServerPanel({ projectId, projectPath }: DevServerPanelProps) {
  const panelVisibleAtom = useMemo(() => devServerPanelVisibleAtomFamily(projectId), [projectId])
  const [isPanelVisible, setIsPanelVisible] = useAtom(panelVisibleAtom)
  const statusAtom = useMemo(() => devServerStatusAtomFamily(projectId), [projectId])
  const status = useAtomValue(statusAtom)

  const [canRenderTerminal, setCanRenderTerminal] = useState(false)

  // Theme detection for terminal background
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const fullThemeData = useAtomValue(fullThemeDataAtom)

  const terminalBg = useMemo(() => {
    if (fullThemeData?.colors?.["terminal.background"]) {
      return fullThemeData.colors["terminal.background"]
    }
    if (fullThemeData?.colors?.["editor.background"]) {
      return fullThemeData.colors["editor.background"]
    }
    return getDefaultTerminalBg(isDark)
  }, [isDark, fullThemeData])

  // Get the dev server pane ID
  const { data: paneIdData } = trpc.devServer.getPaneId.useQuery(
    { projectId },
    { enabled: !!projectId }
  )
  const paneId = paneIdData || `devserver:${projectId}`

  const handleClose = useCallback(() => {
    setIsPanelVisible(false)
  }, [setIsPanelVisible])

  // Delay terminal rendering when panel opens
  useEffect(() => {
    if (isPanelVisible) {
      setCanRenderTerminal(false)
      const timer = setTimeout(() => {
        setCanRenderTerminal(true)
      }, 50) // Small delay to allow panel to render
      return () => clearTimeout(timer)
    } else {
      setCanRenderTerminal(false)
    }
  }, [isPanelVisible])

  // Only show when running and panel is visible
  const isRunning = status === "running"

  return (
    <ResizableBottomPanel
      isOpen={isPanelVisible && isRunning}
      onClose={handleClose}
      heightAtom={devServerPanelHeightAtom}
      minHeight={100}
      maxHeight={500}
      showResizeTooltip={true}
      className="bg-background border-t"
      style={{ borderTopWidth: "0.5px" }}
    >
      <div className="flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center gap-2 pl-1 pr-2 py-1.5 flex-shrink-0 border-t"
          style={{ backgroundColor: terminalBg, borderTopWidth: "0.5px" }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Hide dev server panel"
              >
                <ChevronsDown className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Hide dev server output</TooltipContent>
          </Tooltip>

          <span className="text-sm text-muted-foreground font-medium">Dev Server</span>

          <div className="flex-1" />

          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Running</span>
          </div>
        </div>

        {/* Terminal Content */}
        <div
          className="flex-1 min-h-0 min-w-0 overflow-hidden"
          style={{ backgroundColor: terminalBg }}
        >
          {canRenderTerminal && paneId ? (
            <Terminal
              paneId={paneId}
              cwd={projectPath}
              workspaceId={projectId}
              initialCwd={projectPath}
            />
          ) : (
            <div
              className="flex items-center justify-center h-full text-muted-foreground text-sm"
              style={{ backgroundColor: terminalBg }}
            >
              {!canRenderTerminal ? "" : "Waiting for dev server..."}
            </div>
          )}
        </div>
      </div>
    </ResizableBottomPanel>
  )
}
