import type { LayoutConfig, LayoutType, PaneConfig } from "../types/pane-layout"

// Generate a unique pane ID
let paneIdCounter = 0
export function generatePaneId(): string {
  return `pane-${Date.now()}-${++paneIdCounter}`
}

// Create a default pane config
function createPane(row: number, col: number, rowSpan = 1, colSpan = 1): PaneConfig {
  return {
    id: generatePaneId(),
    row,
    col,
    rowSpan,
    colSpan,
    subChatId: null,
  }
}

// Generate layout configuration for a given preset type
export function generateLayoutConfig(type: LayoutType): LayoutConfig {
  switch (type) {
    case "1x1":
      return {
        type: "1x1",
        rows: 1,
        cols: 1,
        panes: [createPane(0, 0)],
      }

    case "1x2":
      return {
        type: "1x2",
        rows: 1,
        cols: 2,
        panes: [createPane(0, 0), createPane(0, 1)],
      }

    case "2x1":
      return {
        type: "2x1",
        rows: 2,
        cols: 1,
        panes: [createPane(0, 0), createPane(1, 0)],
      }

    case "2x2":
      return {
        type: "2x2",
        rows: 2,
        cols: 2,
        panes: [
          createPane(0, 0),
          createPane(0, 1),
          createPane(1, 0),
          createPane(1, 1),
        ],
      }

    case "2x3":
      return {
        type: "2x3",
        rows: 2,
        cols: 3,
        panes: [
          createPane(0, 0),
          createPane(0, 1),
          createPane(0, 2),
          createPane(1, 0),
          createPane(1, 1),
          createPane(1, 2),
        ],
      }

    default:
      // Fallback to single pane
      return {
        type: "1x1",
        rows: 1,
        cols: 1,
        panes: [createPane(0, 0)],
      }
  }
}

// Migrate layout when changing presets - preserves existing subChatId assignments
export function migrateLayout(
  oldLayout: LayoutConfig,
  newType: LayoutType
): LayoutConfig {
  const newLayout = generateLayoutConfig(newType)

  // Map old subChatIds to new panes in order (left-to-right, top-to-bottom)
  const oldSubChatIds = oldLayout.panes
    .sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row
      return a.col - b.col
    })
    .map((p) => p.subChatId)
    .filter((id): id is string => id !== null)

  // Assign to new panes
  newLayout.panes.forEach((pane, index) => {
    if (index < oldSubChatIds.length) {
      pane.subChatId = oldSubChatIds[index]
    }
  })

  return newLayout
}

// Get pane index from row/col (for keyboard shortcuts Cmd+1-6)
export function getPaneIndex(layout: LayoutConfig, row: number, col: number): number {
  return layout.panes.findIndex((p) => p.row === row && p.col === col)
}

// Get pane by index
export function getPaneByIndex(layout: LayoutConfig, index: number): PaneConfig | undefined {
  // Sort panes by position (top-to-bottom, left-to-right)
  const sorted = [...layout.panes].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    return a.col - b.col
  })
  return sorted[index]
}

// Find pane by ID
export function findPaneById(layout: LayoutConfig, paneId: string): PaneConfig | undefined {
  return layout.panes.find((p) => p.id === paneId)
}

// Find pane by subChatId
export function findPaneBySubChatId(layout: LayoutConfig, subChatId: string): PaneConfig | undefined {
  return layout.panes.find((p) => p.subChatId === subChatId)
}

// Get adjacent pane in a direction
export function getAdjacentPane(
  layout: LayoutConfig,
  currentPaneId: string,
  direction: "up" | "down" | "left" | "right"
): PaneConfig | undefined {
  const current = findPaneById(layout, currentPaneId)
  if (!current) return undefined

  let targetRow = current.row
  let targetCol = current.col

  switch (direction) {
    case "up":
      targetRow = Math.max(0, current.row - 1)
      break
    case "down":
      targetRow = Math.min(layout.rows - 1, current.row + 1)
      break
    case "left":
      targetCol = Math.max(0, current.col - 1)
      break
    case "right":
      targetCol = Math.min(layout.cols - 1, current.col + 1)
      break
  }

  // If we didn't move, return undefined (at edge)
  if (targetRow === current.row && targetCol === current.col) {
    return undefined
  }

  return layout.panes.find((p) => p.row === targetRow && p.col === targetCol)
}

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
