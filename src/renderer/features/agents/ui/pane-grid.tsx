"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { memo, useCallback, useEffect, useMemo } from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { cn } from "../../../lib/utils"
import { trpc } from "../../../lib/trpc"
import { Button } from "../../../components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip"
import {
  focusedPaneIdAtom,
  maximizedPaneIdAtom,
  paneLayoutAtomFamily,
  updatePaneSubChatAtomFamily,
  toggleMaximizePaneAtom,
} from "../atoms/pane-atoms"
import { selectedProjectAtom, subChatModeAtomFamily, getNextMode } from "../atoms"
import { diffSidebarOpenAtomFamily } from "../atoms"
import {
  getPaneByIndex,
  getAdjacentPane,
  findFirstEmptyPane,
} from "../lib/pane-presets"
import { Pane } from "./pane"
import { PaneLayoutSelector } from "./pane-layout-selector"
import { PaneChatView } from "../main/pane-chat-view"
import { UsageIndicator } from "../../usage"
import { usePanePlanApprovalWatcher } from "../hooks/use-pane-plan-approval-watcher"
import type { PaneConfig } from "../types/pane-layout"
import { FileDiff } from "lucide-react"
import { PaneDiffSidebar } from "./pane-diff-sidebar"
import { TerminalSidebar, TerminalBottomPanelContent } from "../../terminal/terminal-sidebar"
import { ResizableBottomPanel } from "@/components/ui/resizable-bottom-panel"
import { CustomTerminalIcon } from "@/components/ui/icons"
import {
  terminalSidebarOpenAtomFamily,
  terminalDisplayModeAtom,
  terminalBottomHeightAtom,
} from "../../terminal/atoms"
import { DevServerControls, DevServerPanel } from "../../dev-server"

interface PaneGridProps {
  projectId: string
  className?: string
}

export const PaneGrid = memo(function PaneGrid({
  projectId,
  className,
}: PaneGridProps) {
  const [layout, setLayout] = useAtom(paneLayoutAtomFamily(projectId))
  const [focusedPaneId, setFocusedPaneId] = useAtom(focusedPaneIdAtom)
  const maximizedPaneId = useAtomValue(maximizedPaneIdAtom)
  const toggleMaximize = useSetAtom(toggleMaximizePaneAtom)
  const updatePaneSubChat = useSetAtom(updatePaneSubChatAtomFamily(projectId))
  const selectedProject = useAtomValue(selectedProjectAtom)
  const diffKey = useMemo(() => `project:${projectId}`, [projectId])
  const diffSidebarAtom = useMemo(() => diffSidebarOpenAtomFamily(diffKey), [diffKey])
  const [isDiffSidebarOpen, setIsDiffSidebarOpen] = useAtom(diffSidebarAtom)

  // Terminal state - scoped to project like diff sidebar
  const terminalKey = useMemo(() => `project:${projectId}`, [projectId])
  const terminalSidebarAtom = useMemo(() => terminalSidebarOpenAtomFamily(terminalKey), [terminalKey])
  const [isTerminalOpen, setIsTerminalOpen] = useAtom(terminalSidebarAtom)
  const terminalDisplayMode = useAtomValue(terminalDisplayModeAtom)

  // Query sub-chats for this project
  const { data: subChatsData } = trpc.chats.listSubChatsByProject.useQuery(
    { projectId },
    { enabled: !!projectId }
  )

  // Create a map for quick sub-chat lookup
  const subChatsMap = useMemo(() => {
    if (!subChatsData) return new Map()
    return new Map(subChatsData.map((sc) => [sc.id, sc]))
  }, [subChatsData])

  // Watch for plan approvals and auto-fullscreen panes
  usePanePlanApprovalWatcher({
    projectId,
    enabled: !!projectId,
  })

  // Create sub-chat mutation
  const createSubChatMutation = trpc.chats.createSubChatForProject.useMutation()
  const utils = trpc.useUtils()

  // Auto-focus first pane if none focused
  useEffect(() => {
    if (!focusedPaneId && layout.panes.length > 0) {
      // Find first pane with content, or just first pane
      const paneWithContent = layout.panes.find((p) => p.subChatId !== null)
      setFocusedPaneId(paneWithContent?.id ?? layout.panes[0].id)
    }
  }, [focusedPaneId, layout.panes, setFocusedPaneId])

  // Handle creating a new chat in a pane
  const handleCreateNew = useCallback(
    async (paneId: string) => {
      if (!selectedProject) return

      try {
        const newSubChat = await createSubChatMutation.mutateAsync({
          projectId: selectedProject.id,
          mode: "plan",
        })

        // Update pane with new sub-chat
        updatePaneSubChat({ paneId, subChatId: newSubChat.id })

        // Focus the pane
        setFocusedPaneId(paneId)

        // Invalidate sub-chats query
        utils.chats.listSubChatsByProject.invalidate({ projectId: selectedProject.id })
      } catch (error) {
        console.error("[PaneGrid] Failed to create sub-chat:", error)
      }
    },
    [selectedProject, createSubChatMutation, updatePaneSubChat, setFocusedPaneId, utils]
  )

  // Handle closing a pane (clearing its sub-chat)
  const handleClosePane = useCallback(
    (paneId: string) => {
      updatePaneSubChat({ paneId, subChatId: null })
    },
    [updatePaneSubChat]
  )

  // Keyboard shortcuts for pane focus (Cmd+1-6)
  useHotkeys(
    "meta+1,meta+2,meta+3,meta+4,meta+5,meta+6",
    (e, handler) => {
      e.preventDefault()
      const keyNum = parseInt(handler.keys?.[0] ?? "1", 10)
      const pane = getPaneByIndex(layout, keyNum - 1)
      if (pane) {
        setFocusedPaneId(pane.id)
      }
    },
    { enableOnFormTags: true },
    [layout, setFocusedPaneId]
  )

  // Arrow navigation between panes (Cmd+Shift+Arrow)
  useHotkeys(
    "meta+shift+up,meta+shift+down,meta+shift+left,meta+shift+right",
    (e, handler) => {
      e.preventDefault()
      if (!focusedPaneId) return

      const direction = handler.keys?.[0] as "up" | "down" | "left" | "right"
      const adjacentPane = getAdjacentPane(layout, focusedPaneId, direction)
      if (adjacentPane) {
        setFocusedPaneId(adjacentPane.id)
      }
    },
    { enableOnFormTags: true },
    [layout, focusedPaneId, setFocusedPaneId]
  )

  // Maximize toggle (Cmd+Enter)
  useHotkeys(
    "meta+enter",
    (e) => {
      e.preventDefault()
      if (focusedPaneId) {
        toggleMaximize(focusedPaneId)
      }
    },
    { enableOnFormTags: true },
    [focusedPaneId, toggleMaximize]
  )

  // Toggle diff (Cmd+D)
  useHotkeys(
    "meta+d",
    (e) => {
      e.preventDefault()
      setIsDiffSidebarOpen(!isDiffSidebarOpen)
    },
    { enableOnFormTags: true },
    [isDiffSidebarOpen, setIsDiffSidebarOpen]
  )

  // Toggle terminal (Cmd+J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.metaKey &&
        !e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        e.code === "KeyJ"
      ) {
        e.preventDefault()
        e.stopPropagation()
        setIsTerminalOpen(!isTerminalOpen)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [isTerminalOpen, setIsTerminalOpen])

  // New chat in focused pane (Cmd+N)
  useHotkeys(
    "meta+n",
    (e) => {
      e.preventDefault()

      // Find pane to create in
      let targetPaneId: string | null = null

      if (focusedPaneId) {
        const focusedPane = layout.panes.find((p) => p.id === focusedPaneId)
        // If focused pane is empty, use it
        if (focusedPane && !focusedPane.subChatId) {
          targetPaneId = focusedPaneId
        }
      }

      // If no target yet, find first empty pane
      if (!targetPaneId) {
        targetPaneId = findFirstEmptyPane(layout)
      }

      // If still no target, use focused pane (will replace content)
      if (!targetPaneId && focusedPaneId) {
        targetPaneId = focusedPaneId
      }

      if (targetPaneId) {
        handleCreateNew(targetPaneId)
      }
    },
    { enableOnFormTags: false }, // Don't trigger when typing
    [layout, focusedPaneId, handleCreateNew]
  )

  // Get the focused pane's subChatId for mode toggling
  const focusedSubChatId = useMemo(() => {
    if (!focusedPaneId) return null
    const focusedPane = layout.panes.find((p) => p.id === focusedPaneId)
    return focusedPane?.subChatId ?? null
  }, [focusedPaneId, layout.panes])

  // Get/set mode for focused pane's sub-chat
  const focusedSubChatModeAtom = useMemo(
    () => subChatModeAtomFamily(focusedSubChatId ?? ""),
    [focusedSubChatId]
  )
  const [focusedSubChatMode, setFocusedSubChatMode] = useAtom(focusedSubChatModeAtom)

  // Toggle mode between plan and agent (Shift+Tab)
  // Using useEffect because react-hotkeys-hook doesn't handle Tab key well
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift+Tab to toggle mode
      if (e.shiftKey && e.key === "Tab") {
        // Only handle if we have a focused pane with a sub-chat
        if (!focusedSubChatId) return

        e.preventDefault()
        e.stopPropagation()

        const nextMode = getNextMode(focusedSubChatMode)
        setFocusedSubChatMode(nextMode)
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true })
  }, [focusedSubChatId, focusedSubChatMode, setFocusedSubChatMode])

  // Get sorted panes for rendering
  const sortedPanes = useMemo(() => {
    return [...layout.panes].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row
      return a.col - b.col
    })
  }, [layout.panes])

  // If a pane is maximized, only render that one
  if (maximizedPaneId) {
    const maximizedPane = layout.panes.find((p) => p.id === maximizedPaneId)
    if (maximizedPane) {
      const subChat = maximizedPane.subChatId
        ? subChatsMap.get(maximizedPane.subChatId)
        : null

      return (
        <div className="h-full p-2">
          <Pane
            pane={maximizedPane}
            projectId={projectId}
            paneIndex={sortedPanes.findIndex((p) => p.id === maximizedPane.id)}
            subChatName={subChat?.name}
            subChatMode={subChat?.mode as "plan" | "agent" | undefined}
            onCreateNew={() => handleCreateNew(maximizedPane.id)}
            onClose={() => handleClosePane(maximizedPane.id)}
          >
            {maximizedPane.subChatId && selectedProject && (
              <PaneChatView
                paneId={maximizedPane.id}
                subChatId={maximizedPane.subChatId}
                projectId={projectId}
                projectPath={selectedProject.path}
                isFocused={true}
                onClearAndNew={() => handleCreateNew(maximizedPane.id)}
              />
            )}
          </Pane>
        </div>
      )
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Main content wrapper */}
      <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", className)}>
        {/* Header with layout selector */}
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedProject?.name ?? "Project"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Dev Server Controls */}
            {selectedProject && (
              <DevServerControls
                projectId={projectId}
                projectPath={selectedProject.path}
              />
            )}
            <UsageIndicator />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                >
                  <CustomTerminalIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Terminal <span className="ml-2">⌘J</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsDiffSidebarOpen(!isDiffSidebarOpen)}
                >
                  <FileDiff className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Open diff <span className="ml-2">⌘D</span>
              </TooltipContent>
            </Tooltip>
            <PaneLayoutSelector projectId={projectId} />
          </div>
        </div>

        {/* Horizontal flex container for grid + sidebars */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Grid of panes */}
          <div
            className="flex-1 min-h-0 grid gap-2 p-2 overflow-hidden"
            style={{
              gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
              gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
            }}
          >
            {sortedPanes.map((pane, index) => {
              const subChat = pane.subChatId
                ? subChatsMap.get(pane.subChatId)
                : null

              return (
                <Pane
                  key={pane.id}
                  pane={pane}
                  projectId={projectId}
                  paneIndex={index}
                  subChatName={subChat?.name}
                  subChatMode={subChat?.mode as "plan" | "agent" | undefined}
                  onCreateNew={() => handleCreateNew(pane.id)}
                  onClose={() => handleClosePane(pane.id)}
                >
                  {pane.subChatId && selectedProject && (
                    <PaneChatView
                      paneId={pane.id}
                      subChatId={pane.subChatId}
                      projectId={projectId}
                      projectPath={selectedProject.path}
                      isFocused={focusedPaneId === pane.id}
                      onClearAndNew={() => handleCreateNew(pane.id)}
                    />
                  )}
                </Pane>
              )
            })}
          </div>

          {/* Diff Sidebar */}
          {selectedProject && (
            <PaneDiffSidebar
              projectId={projectId}
              projectPath={selectedProject.path}
              focusedSubChatId={focusedSubChatId}
            />
          )}

          {/* Terminal Sidebar (side-peek mode) */}
          {selectedProject && (
            <TerminalSidebar
              chatId={terminalKey}
              cwd={selectedProject.path}
              workspaceId={projectId}
            />
          )}
        </div>
      </div>

      {/* Terminal Bottom Panel (bottom mode) */}
      {terminalDisplayMode === "bottom" && selectedProject && (
        <ResizableBottomPanel
          isOpen={isTerminalOpen}
          onClose={() => setIsTerminalOpen(false)}
          heightAtom={terminalBottomHeightAtom}
          minHeight={150}
          maxHeight={500}
          showResizeTooltip={true}
          className="bg-background border-t"
          style={{ borderTopWidth: "0.5px" }}
        >
          <TerminalBottomPanelContent
            chatId={terminalKey}
            cwd={selectedProject.path}
            workspaceId={projectId}
            onClose={() => setIsTerminalOpen(false)}
          />
        </ResizableBottomPanel>
      )}

      {/* Dev Server Bottom Panel */}
      {selectedProject && (
        <DevServerPanel
          projectId={projectId}
          projectPath={selectedProject.path}
        />
      )}
    </div>
  )
})
