// Layout type presets for pane grid
export type LayoutType = "1x1" | "1x2" | "2x1" | "2x2" | "2x3"

// Configuration for a single pane in the grid
export interface PaneConfig {
  id: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  subChatId: string | null
}

// Full layout configuration for a project
export interface LayoutConfig {
  type: LayoutType
  rows: number
  cols: number
  panes: PaneConfig[]
}

// Layout preset metadata for display
export interface LayoutPresetInfo {
  type: LayoutType
  label: string
  rows: number
  cols: number
  paneCount: number
}

// Available layout presets with metadata
export const LAYOUT_PRESETS: LayoutPresetInfo[] = [
  { type: "1x1", label: "Single", rows: 1, cols: 1, paneCount: 1 },
  { type: "1x2", label: "Side by Side", rows: 1, cols: 2, paneCount: 2 },
  { type: "2x1", label: "Stacked", rows: 2, cols: 1, paneCount: 2 },
  { type: "2x2", label: "2×2 Grid", rows: 2, cols: 2, paneCount: 4 },
  { type: "2x3", label: "2×3 Grid", rows: 2, cols: 3, paneCount: 6 },
]

// Get preset info by type
export function getLayoutPreset(type: LayoutType): LayoutPresetInfo {
  return LAYOUT_PRESETS.find((p) => p.type === type) ?? LAYOUT_PRESETS[0]
}
