import { atom } from "jotai"
import { atomFamily, atomWithStorage } from "jotai/utils"
import { atomWithWindowStorage } from "../../lib/window-storage"

// Dev server status types
export type DevServerStatus = "stopped" | "starting" | "running" | "stopping" | "error"

// Storage atom for persisting per-project dev server panel visibility - window-scoped
const devServerPanelVisibleStorageAtom = atomWithWindowStorage<Record<string, boolean>>(
  "dev-server-panel-visible-by-project",
  {},
  { getOnInit: true },
)

// Per-project dev server panel visibility
export const devServerPanelVisibleAtomFamily = atomFamily((projectId: string) =>
  atom(
    (get) => get(devServerPanelVisibleStorageAtom)[projectId] ?? false,
    (get, set, isVisible: boolean) => {
      const current = get(devServerPanelVisibleStorageAtom)
      set(devServerPanelVisibleStorageAtom, { ...current, [projectId]: isVisible })
    },
  ),
)

// Dev server status per project (in-memory, not persisted)
export const devServerStatusAtomFamily = atomFamily((_projectId: string) =>
  atom<DevServerStatus>("stopped"),
)

// Dev server panel height (persisted globally)
export const devServerPanelHeightAtom = atomWithStorage<number>(
  "dev-server-panel-height",
  250,
  undefined,
  { getOnInit: true },
)
