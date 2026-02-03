/**
 * Hook to watch for plan approvals in pane view.
 * When a plan finishes and waits for authorization:
 * 1. Shows a desktop notification: "Pane {N} is waiting for approval"
 * 2. Auto-fullscreens the pane (or queues it if another is already fullscreen)
 */

import { useCallback, useEffect, useRef } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { trpc } from "../../../lib/trpc"
import { useDesktopNotifications } from "./use-desktop-notifications"
import {
  paneLayoutAtomFamily,
  enqueueFullscreenPaneAtom,
} from "../atoms/pane-atoms"
import { findPaneBySubChatId } from "../lib/pane-presets"
import type { LayoutConfig } from "../types/pane-layout"

interface UsePanePlanApprovalWatcherOptions {
  projectId: string
  enabled?: boolean
}

// Polling interval for plan approval check (5 seconds)
const POLL_INTERVAL_MS = 5000

/**
 * Get 1-based pane number for a subChatId based on layout position
 * Panes are numbered left-to-right, top-to-bottom
 */
function getPaneNumber(layout: LayoutConfig, subChatId: string): number | null {
  const sortedPanes = [...layout.panes].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    return a.col - b.col
  })
  const index = sortedPanes.findIndex((p) => p.subChatId === subChatId)
  return index >= 0 ? index + 1 : null
}

export function usePanePlanApprovalWatcher({
  projectId,
  enabled = true,
}: UsePanePlanApprovalWatcherOptions) {
  const layout = useAtomValue(paneLayoutAtomFamily(projectId))
  const enqueueFullscreen = useSetAtom(enqueueFullscreenPaneAtom)
  const { showNotification } = useDesktopNotifications()

  // Track which subChatIds we've already notified about to prevent duplicates
  const notifiedSubChatIdsRef = useRef<Set<string>>(new Set())

  // Get all subChatIds from the current layout for querying
  const openSubChatIds = layout.panes
    .map((p) => p.subChatId)
    .filter((id): id is string => id !== null)

  // Query pending plan approvals for the open panes
  const { data: pendingApprovals } = trpc.chats.getPendingPlanApprovals.useQuery(
    { openSubChatIds },
    {
      enabled: enabled && openSubChatIds.length > 0,
      refetchInterval: POLL_INTERVAL_MS,
      // Don't refetch on window focus - we have interval polling
      refetchOnWindowFocus: false,
    }
  )

  // Handle new pending approvals
  const handleNewApprovals = useCallback(
    (approvals: Array<{ subChatId: string; chatId: string }>) => {
      if (!approvals || approvals.length === 0) return

      for (const approval of approvals) {
        // Skip if we've already notified about this subChatId
        if (notifiedSubChatIdsRef.current.has(approval.subChatId)) {
          continue
        }

        // Mark as notified
        notifiedSubChatIdsRef.current.add(approval.subChatId)

        // Find the pane for this subChat
        const pane = findPaneBySubChatId(layout, approval.subChatId)
        if (!pane) continue

        // Get pane number for notification message
        const paneNumber = getPaneNumber(layout, approval.subChatId)
        const paneLabel = paneNumber ? `Pane ${paneNumber}` : "A pane"

        // Show notification (only if window is not focused)
        if (!document.hasFocus()) {
          showNotification(
            "Plan Ready for Approval",
            `${paneLabel} is waiting for approval`,
            { priority: "plan" }
          )
        }

        // Auto-fullscreen the pane (or queue it)
        enqueueFullscreen(pane.id)
      }
    },
    [layout, showNotification, enqueueFullscreen]
  )

  // Cleanup notified tracking when approvals are resolved
  const cleanupResolvedApprovals = useCallback(
    (approvals: Array<{ subChatId: string; chatId: string }> | undefined) => {
      if (!approvals) return

      const currentPendingIds = new Set(approvals.map((a) => a.subChatId))

      // Remove from tracking any subChatIds that are no longer pending
      // (user approved the plan)
      for (const notifiedId of notifiedSubChatIdsRef.current) {
        if (!currentPendingIds.has(notifiedId)) {
          notifiedSubChatIdsRef.current.delete(notifiedId)
        }
      }
    },
    []
  )

  // React to changes in pending approvals
  useEffect(() => {
    if (!pendingApprovals) return

    // Handle new approvals (show notifications, enqueue fullscreen)
    handleNewApprovals(pendingApprovals)

    // Cleanup resolved approvals from tracking
    cleanupResolvedApprovals(pendingApprovals)
  }, [pendingApprovals, handleNewApprovals, cleanupResolvedApprovals])

  // Cleanup tracking when component unmounts or project changes
  useEffect(() => {
    return () => {
      notifiedSubChatIdsRef.current.clear()
    }
  }, [projectId])
}
