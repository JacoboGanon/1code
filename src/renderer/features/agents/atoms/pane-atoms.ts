import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"
import { atomWithWindowStorage } from "../../../lib/window-storage"
import type { LayoutConfig, LayoutType } from "../types/pane-layout"
import { generateLayoutConfig } from "../lib/pane-presets"

// Storage for pane layouts per project
// Using localStorage with project-scoped keys for persistence
const paneLayoutsStorageAtom = atomWithStorage<Record<string, LayoutConfig>>(
  "agents:paneLayouts",
  {},
  undefined,
  { getOnInit: true }
)

// atomFamily to get/set pane layout per projectId
export const paneLayoutAtomFamily = atomFamily((projectId: string) =>
  atom(
    (get) => {
      const stored = get(paneLayoutsStorageAtom)[projectId]
      // Return stored layout or default to 1x1
      return stored ?? generateLayoutConfig("1x1")
    },
    (get, set, newLayout: LayoutConfig) => {
      const current = get(paneLayoutsStorageAtom)
      set(paneLayoutsStorageAtom, { ...current, [projectId]: newLayout })
    }
  )
)

// Helper atom to set layout type (generates new config)
export const setLayoutTypeAtomFamily = atomFamily((projectId: string) =>
  atom(null, (get, set, layoutType: LayoutType) => {
    const currentLayout = get(paneLayoutAtomFamily(projectId))
    // Import dynamically to avoid circular deps
    const { migrateLayout } = require("../lib/pane-presets")
    const newLayout = migrateLayout(currentLayout, layoutType)
    set(paneLayoutAtomFamily(projectId), newLayout)
  })
)

// Currently focused pane ID - window-scoped since each window has its own focus
export const focusedPaneIdAtom = atomWithWindowStorage<string | null>(
  "agents:focusedPaneId",
  null,
  { getOnInit: true }
)

// Maximized pane ID - window-scoped for per-window maximize state
// null means no pane is maximized
export const maximizedPaneIdAtom = atomWithWindowStorage<string | null>(
  "agents:maximizedPaneId",
  null,
  { getOnInit: true }
)

// Queue of pane IDs waiting to be fullscreened
// Window-scoped since each window has its own maximize state
export const fullscreenQueueAtom = atomWithWindowStorage<string[]>(
  "agents:fullscreenQueue",
  [],
  { getOnInit: true }
)

// Helper to toggle maximize for a pane
// When minimizing, processes the queue to maximize the next pane
export const toggleMaximizePaneAtom = atom(
  null,
  (get, set, paneId: string) => {
    const current = get(maximizedPaneIdAtom)
    if (current === paneId) {
      // Minimizing - check queue for next pane
      const queue = get(fullscreenQueueAtom)
      if (queue.length > 0) {
        const [nextPaneId, ...rest] = queue
        set(fullscreenQueueAtom, rest)
        set(maximizedPaneIdAtom, nextPaneId)
      } else {
        set(maximizedPaneIdAtom, null)
      }
    } else {
      // Maximize this pane
      set(maximizedPaneIdAtom, paneId)
    }
  }
)

// Add a pane to fullscreen queue (or maximize immediately if none maximized)
export const enqueueFullscreenPaneAtom = atom(
  null,
  (get, set, paneId: string) => {
    const currentMaximized = get(maximizedPaneIdAtom)
    if (currentMaximized === null) {
      // No pane maximized - maximize immediately
      set(maximizedPaneIdAtom, paneId)
    } else if (currentMaximized !== paneId) {
      // Another pane is maximized - add to queue if not already queued
      const queue = get(fullscreenQueueAtom)
      if (!queue.includes(paneId)) {
        set(fullscreenQueueAtom, [...queue, paneId])
      }
    }
  }
)

// Update a specific pane's subChatId in the layout
export const updatePaneSubChatAtomFamily = atomFamily((projectId: string) =>
  atom(null, (get, set, update: { paneId: string; subChatId: string | null }) => {
    const layout = get(paneLayoutAtomFamily(projectId))
    const updatedPanes = layout.panes.map((pane) =>
      pane.id === update.paneId
        ? { ...pane, subChatId: update.subChatId }
        : pane
    )
    set(paneLayoutAtomFamily(projectId), { ...layout, panes: updatedPanes })
  })
)

// Clear a pane (set its subChatId to null)
export const clearPaneAtomFamily = atomFamily((projectId: string) =>
  atom(null, (get, set, paneId: string) => {
    const layout = get(paneLayoutAtomFamily(projectId))
    const updatedPanes = layout.panes.map((pane) =>
      pane.id === paneId ? { ...pane, subChatId: null } : pane
    )
    set(paneLayoutAtomFamily(projectId), { ...layout, panes: updatedPanes })
  })
)

// Find first empty pane in layout
export function findFirstEmptyPane(layout: LayoutConfig): string | null {
  // Sort by position (top-to-bottom, left-to-right)
  const sortedPanes = [...layout.panes].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    return a.col - b.col
  })

  const emptyPane = sortedPanes.find((p) => p.subChatId === null)
  return emptyPane?.id ?? null
}
