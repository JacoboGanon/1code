"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { memo, useCallback, useRef, useEffect } from "react"
import { Maximize2, Minimize2, Plus, X } from "lucide-react"
import { Button } from "../../../components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { Kbd } from "../../../components/ui/kbd"
import { cn } from "../../../lib/utils"
import { AgentIcon, PlanIcon, IconSpinner } from "../../../components/ui/icons"
import {
  focusedPaneIdAtom,
  maximizedPaneIdAtom,
  toggleMaximizePaneAtom,
  clearPaneAtomFamily,
} from "../atoms/pane-atoms"
import type { PaneConfig } from "../types/pane-layout"

interface PaneProps {
  pane: PaneConfig
  projectId: string
  paneIndex: number // 0-based index for Cmd+1-6 shortcuts
  subChatName?: string | null
  subChatMode?: "plan" | "agent"
  isLoading?: boolean
  children?: React.ReactNode
  onCreateNew?: () => void
  onClose?: () => void
}

export const Pane = memo(function Pane({
  pane,
  projectId,
  paneIndex,
  subChatName,
  subChatMode = "agent",
  isLoading = false,
  children,
  onCreateNew,
  onClose,
}: PaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusedPaneId, setFocusedPaneId] = useAtom(focusedPaneIdAtom)
  const maximizedPaneId = useAtomValue(maximizedPaneIdAtom)
  const toggleMaximize = useSetAtom(toggleMaximizePaneAtom)
  const clearPane = useSetAtom(clearPaneAtomFamily(projectId))

  const isFocused = focusedPaneId === pane.id
  const isMaximized = maximizedPaneId === pane.id
  const hasSubChat = pane.subChatId !== null

  // Handle click to focus
  const handleFocus = useCallback(() => {
    if (focusedPaneId !== pane.id) {
      setFocusedPaneId(pane.id)
    }
  }, [focusedPaneId, pane.id, setFocusedPaneId])

  // Handle maximize toggle
  const handleMaximize = useCallback(() => {
    toggleMaximize(pane.id)
  }, [pane.id, toggleMaximize])

  // Handle close (clear the pane)
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose()
    } else {
      clearPane(pane.id)
    }
  }, [clearPane, onClose, pane.id])

  // Focus this pane when it's selected
  useEffect(() => {
    if (isFocused && containerRef.current) {
      // Focus the container for keyboard events
      containerRef.current.focus()
    }
  }, [isFocused])

  // Mode icon component
  const ModeIcon = subChatMode === "plan" ? PlanIcon : AgentIcon

  // Shortcut number (1-based for display)
  const shortcutNumber = paneIndex + 1

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col h-full min-h-0 bg-background rounded-lg border transition-all duration-150",
        isFocused
          ? "border-foreground/20 ring-1 ring-foreground/10"
          : "border-border hover:border-foreground/10",
        isMaximized && "fixed inset-4 z-50 shadow-2xl"
      )}
      style={{
        gridRow: `${pane.row + 1} / span ${pane.rowSpan}`,
        gridColumn: `${pane.col + 1} / span ${pane.colSpan}`,
      }}
      onClick={handleFocus}
      tabIndex={0}
    >
      {/* Pane Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 h-9 border-b shrink-0",
          isFocused ? "border-foreground/10" : "border-transparent"
        )}
      >
        {/* Mode icon and name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isLoading ? (
            <IconSpinner className="h-4 w-4 text-muted-foreground animate-spin" />
          ) : hasSubChat ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0 cursor-default">
                  <ModeIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {subChatMode === "plan" ? "Plan mode" : "Agent mode"}
                <Kbd className="ml-2">⇧Tab</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}

          {hasSubChat ? (
            <span className="text-sm truncate">
              {subChatName || "New Chat"}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              Empty pane
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Keyboard shortcut hint */}
          {shortcutNumber <= 6 && (
            <Kbd className="text-[10px] opacity-50">⌘{shortcutNumber}</Kbd>
          )}

          {/* New chat button (shown when empty) */}
          {!hasSubChat && onCreateNew && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreateNew()
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New chat in this pane</TooltipContent>
            </Tooltip>
          )}

          {/* Maximize/Minimize button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMaximize()
                }}
              >
                {isMaximized ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isMaximized ? "Restore" : "Maximize"}
              <Kbd>⌘↵</Kbd>
            </TooltipContent>
          </Tooltip>

          {/* Close button (shown when has content) */}
          {hasSubChat && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClose()
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close chat</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-hidden">
        {children ?? (
          // Empty state
          <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                No chat in this pane
              </p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Start a new chat or select from history
              </p>
            </div>
            {onCreateNew && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateNew()
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

// Simple empty pane placeholder for grid layout preview
export const EmptyPanePlaceholder = memo(function EmptyPanePlaceholder({
  row,
  col,
}: {
  row: number
  col: number
}) {
  return (
    <div
      className="flex items-center justify-center h-full bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20"
      style={{
        gridRow: row + 1,
        gridColumn: col + 1,
      }}
    >
      <Plus className="h-8 w-8 text-muted-foreground/30" />
    </div>
  )
})
