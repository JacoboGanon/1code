import { useCallback, useEffect, useMemo } from "react"
import { useAtom } from "jotai"
import { Play, Square, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { IconSpinner } from "@/components/ui/icons"
import { trpc } from "@/lib/trpc"
import {
  devServerStatusAtomFamily,
  devServerPanelVisibleAtomFamily,
  type DevServerStatus,
} from "./atoms"

interface DevServerControlsProps {
  projectId: string
  projectPath: string
}

export function DevServerControls({ projectId }: DevServerControlsProps) {
  const statusAtom = useMemo(() => devServerStatusAtomFamily(projectId), [projectId])
  const [status, setStatus] = useAtom(statusAtom)
  const panelVisibleAtom = useMemo(() => devServerPanelVisibleAtomFamily(projectId), [projectId])
  const [isPanelVisible, setIsPanelVisible] = useAtom(panelVisibleAtom)

  // Query project for devServerCommand
  const { data: project } = trpc.projects.get.useQuery({ id: projectId })
  const hasCommand = !!project?.devServerCommand

  // Query current status
  const { data: statusData, refetch: refetchStatus } = trpc.devServer.getStatus.useQuery(
    { projectId },
    { refetchInterval: 5000 } // Poll every 5 seconds
  )

  // Sync status from backend
  useEffect(() => {
    if (statusData) {
      setStatus(statusData.status === "running" ? "running" : "stopped")
    }
  }, [statusData, setStatus])

  // Mutations
  const startMutation = trpc.devServer.start.useMutation({
    onMutate: () => setStatus("starting"),
    onSuccess: () => {
      setStatus("running")
      setIsPanelVisible(true) // Auto-show panel when starting
      refetchStatus()
    },
    onError: () => setStatus("error"),
  })

  const stopMutation = trpc.devServer.stop.useMutation({
    onMutate: () => setStatus("stopping"),
    onSuccess: () => {
      setStatus("stopped")
      refetchStatus()
    },
    onError: () => setStatus("error"),
  })

  const restartMutation = trpc.devServer.restart.useMutation({
    onMutate: () => setStatus("starting"),
    onSuccess: () => {
      setStatus("running")
      refetchStatus()
    },
    onError: () => setStatus("error"),
  })

  const handleStart = useCallback(() => {
    startMutation.mutate({ projectId })
  }, [startMutation, projectId])

  const handleStop = useCallback(() => {
    stopMutation.mutate({ projectId })
  }, [stopMutation, projectId])

  const handleRestart = useCallback(() => {
    restartMutation.mutate({ projectId })
  }, [restartMutation, projectId])

  const isLoading = status === "starting" || status === "stopping"
  const isRunning = status === "running"

  // Show loading spinner
  if (isLoading) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled
          >
            <IconSpinner className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {status === "starting" ? "Starting dev server..." : "Stopping dev server..."}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Running state: show stop + restart buttons
  if (isRunning) {
    return (
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={handleStop}
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop dev server</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10"
              onClick={handleRestart}
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Restart dev server</TooltipContent>
        </Tooltip>

        {/* Toggle panel visibility */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsPanelVisible(!isPanelVisible)}
            >
              {isPanelVisible ? "Hide Logs" : "Show Logs"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isPanelVisible ? "Hide dev server output" : "Show dev server output"}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  // Stopped state: show play button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10 disabled:text-muted-foreground disabled:hover:bg-transparent"
          onClick={handleStart}
          disabled={!hasCommand}
        >
          <Play className="h-4 w-4 fill-current" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {hasCommand
          ? "Start dev server"
          : "Configure dev server command in project settings"}
      </TooltipContent>
    </Tooltip>
  )
}
