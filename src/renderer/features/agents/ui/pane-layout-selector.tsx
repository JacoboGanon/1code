"use client"

import { useAtom } from "jotai"
import { memo, useCallback } from "react"
import { Columns2, Rows2, Grid2X2, LayoutGrid, Square } from "lucide-react"
import { Button } from "../../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../../components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import { paneLayoutAtomFamily } from "../atoms/pane-atoms"
import { migrateLayout } from "../lib/pane-presets"
import { LAYOUT_PRESETS, type LayoutType } from "../types/pane-layout"

interface PaneLayoutSelectorProps {
  projectId: string
  className?: string
}

// Icons for each layout type
const layoutIcons: Record<LayoutType, React.ReactNode> = {
  "1x1": <Square className="h-4 w-4" />,
  "1x2": <Columns2 className="h-4 w-4" />,
  "2x1": <Rows2 className="h-4 w-4" />,
  "2x2": <Grid2X2 className="h-4 w-4" />,
  "2x3": <LayoutGrid className="h-4 w-4" />,
}

// Visual preview of each layout
function LayoutPreview({ type, size = 20 }: { type: LayoutType; size?: number }) {
  const preset = LAYOUT_PRESETS.find((p) => p.type === type)
  if (!preset) return null

  const cellSize = size / Math.max(preset.rows, preset.cols)
  const gap = 1

  return (
    <div
      className="grid bg-muted/50 rounded-sm overflow-hidden"
      style={{
        gridTemplateRows: `repeat(${preset.rows}, ${cellSize}px)`,
        gridTemplateColumns: `repeat(${preset.cols}, ${cellSize}px)`,
        gap: `${gap}px`,
        width: `${cellSize * preset.cols + gap * (preset.cols - 1)}px`,
        height: `${cellSize * preset.rows + gap * (preset.rows - 1)}px`,
      }}
    >
      {Array.from({ length: preset.paneCount }).map((_, i) => (
        <div
          key={i}
          className="bg-foreground/20 rounded-[1px]"
        />
      ))}
    </div>
  )
}

export const PaneLayoutSelector = memo(function PaneLayoutSelector({
  projectId,
  className,
}: PaneLayoutSelectorProps) {
  const [layout, setLayout] = useAtom(paneLayoutAtomFamily(projectId))

  const handleLayoutChange = useCallback(
    (newType: LayoutType) => {
      if (newType === layout.type) return
      const newLayout = migrateLayout(layout, newType)
      setLayout(newLayout)
    },
    [layout, setLayout]
  )

  const currentPreset = LAYOUT_PRESETS.find((p) => p.type === layout.type)

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 gap-1.5",
                className
              )}
            >
              <LayoutPreview type={layout.type} size={16} />
              <span className="text-xs text-muted-foreground">
                {currentPreset?.label ?? "Layout"}
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Change pane layout
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        {LAYOUT_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.type}
            onClick={() => handleLayoutChange(preset.type)}
            className={cn(
              "flex items-center gap-3 cursor-pointer",
              layout.type === preset.type && "bg-accent"
            )}
          >
            <LayoutPreview type={preset.type} size={20} />
            <div className="flex-1">
              <div className="text-sm">{preset.label}</div>
              <div className="text-xs text-muted-foreground">
                {preset.paneCount} {preset.paneCount === 1 ? "pane" : "panes"}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          Each pane is an independent chat session
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

// Quick layout buttons for inline use
interface QuickLayoutButtonsProps {
  projectId: string
  className?: string
}

export const QuickLayoutButtons = memo(function QuickLayoutButtons({
  projectId,
  className,
}: QuickLayoutButtonsProps) {
  const [layout, setLayout] = useAtom(paneLayoutAtomFamily(projectId))

  const handleLayoutChange = useCallback(
    (newType: LayoutType) => {
      if (newType === layout.type) return
      const newLayout = migrateLayout(layout, newType)
      setLayout(newLayout)
    },
    [layout, setLayout]
  )

  // Show quick buttons for common layouts
  const quickLayouts: LayoutType[] = ["1x1", "1x2", "2x2"]

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {quickLayouts.map((type) => (
        <Tooltip key={type}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                layout.type === type && "bg-accent"
              )}
              onClick={() => handleLayoutChange(type)}
            >
              {layoutIcons[type]}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {LAYOUT_PRESETS.find((p) => p.type === type)?.label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
})
