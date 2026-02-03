/**
 * Shared configuration for the desktop app
 */
import { app } from "electron"

const IS_DEV = !!process.env.ELECTRON_RENDERER_URL
const LOCAL_API_FALLBACK = "http://localhost:3000"

function sanitizeApiUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const normalized = url.trim()
  if (!normalized) return null
  if (normalized.includes("21st.dev")) return null
  return normalized
}

/**
 * Get the API base URL
 * In packaged app, use configured URL or localhost fallback
 * In dev mode, allow override via MAIN_VITE_API_URL env variable
 */
export function getApiUrl(): string {
  const envUrl = sanitizeApiUrl(import.meta.env.MAIN_VITE_API_URL)
  if (envUrl) return envUrl
  if (app.isPackaged) return LOCAL_API_FALLBACK
  return LOCAL_API_FALLBACK
}

/**
 * Check if running in development mode
 */
export function isDev(): boolean {
  return IS_DEV
}
