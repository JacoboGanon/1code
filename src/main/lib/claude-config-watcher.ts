/**
 * Watches ~/.claude.json for changes and notifies renderer to re-initialize MCP servers.
 *
 * When a user edits their Claude config (e.g., adding/removing MCP servers),
 * this watcher detects the change, clears cached MCP data, and notifies
 * the renderer so it can refresh MCP server status without requiring a restart.
 */
import { BrowserWindow } from "electron"
import * as os from "os"
import * as path from "path"
import { mcpConfigCache, workingMcpServers } from "./trpc/routers/claude"

const CLAUDE_CONFIG_PATH = path.join(os.homedir(), ".claude.json")

// Simple debounce to batch rapid file changes
function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), wait)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let watcher: any = null

/**
 * Start watching ~/.claude.json for changes.
 * When changes are detected:
 * 1. Clears the in-memory MCP config cache and working servers cache
 * 2. Sends an IPC event to all renderer windows so they can refetch MCP config
 */
export async function startClaudeConfigWatcher(): Promise<void> {
  if (watcher) return

  const chokidar = await import("chokidar")

  watcher = chokidar.watch(CLAUDE_CONFIG_PATH, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
    usePolling: false,
    followSymlinks: false,
  })

  const handleChange = debounce(() => {
    console.log("[ConfigWatcher] ~/.claude.json changed, clearing MCP caches")

    // Clear MCP-related caches so next session/query reads fresh config
    mcpConfigCache.clear()
    workingMcpServers.clear()

    // Notify all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send("claude-config-changed")
        } catch {
          // Window may have been destroyed between check and send
        }
      }
    }
  }, 300)

  watcher
    .on("change", () => handleChange())
    .on("add", () => handleChange())
    .on("error", (error: Error) => {
      console.error("[ConfigWatcher] Error watching ~/.claude.json:", error)
    })

  console.log("[ConfigWatcher] Watching ~/.claude.json for changes")
}

/**
 * Stop watching ~/.claude.json.
 * Call this when the app is shutting down.
 */
export async function stopClaudeConfigWatcher(): Promise<void> {
  if (watcher) {
    await (watcher as any).close()
    watcher = null
    console.log("[ConfigWatcher] Stopped watching ~/.claude.json")
  }
}
