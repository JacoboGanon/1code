import { eq, sql } from "drizzle-orm"
import { safeStorage, shell } from "electron"
import { z } from "zod"
import { getAuthManager } from "../../../index"
import { getClaudeShellEnvironment } from "../../claude"
import { getExistingClaudeCredentials, type ClaudeOAuthCredential } from "../../claude-token"
import { getApiUrl } from "../../config"
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "../../db"
import { createId } from "../../db/utils"
import { publicProcedure, router } from "../index"

/**
 * Get desktop auth token for server API calls (optional - returns null if not authenticated)
 */
async function getDesktopToken(): Promise<string | null> {
  try {
    const authManager = getAuthManager()
    return authManager?.getValidToken() ?? null
  } catch {
    return null
  }
}

/**
 * Encrypt token using Electron's safeStorage
 */
function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[ClaudeCode] Encryption not available, storing as base64")
    return Buffer.from(token).toString("base64")
  }
  return safeStorage.encryptString(token).toString("base64")
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Store OAuth credentials - now uses multi-account system
 * Stores full credentials including refresh token and expiry
 * If setAsActive is true, also sets this account as active
 */
function storeOAuthCredentials(
  creds: {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
  },
  setAsActive = true
): string {
  const authManager = getAuthManager()
  const user = authManager.getUser()

  const encryptedToken = encryptToken(creds.accessToken)
  const encryptedRefreshToken = creds.refreshToken
    ? encryptToken(creds.refreshToken)
    : null
  const db = getDatabase()
  const newId = createId()

  // Store in new multi-account table with full credentials
  db.insert(anthropicAccounts)
    .values({
      id: newId,
      oauthToken: encryptedToken,
      refreshToken: encryptedRefreshToken,
      expiresAt: creds.expiresAt ?? null,
      displayName: "Anthropic Account",
      connectedAt: new Date(),
      desktopUserId: user?.id ?? null,
    })
    .run()

  if (setAsActive) {
    // Set as active account
    db.insert(anthropicSettings)
      .values({
        id: "singleton",
        activeAccountId: newId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: anthropicSettings.id,
        set: {
          activeAccountId: newId,
          updatedAt: new Date(),
        },
      })
      .run()
  }

  // Also update legacy table for backward compatibility
  db.delete(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, "default"))
    .run()

  db.insert(claudeCodeCredentials)
    .values({
      id: "default",
      oauthToken: encryptedToken,
      connectedAt: new Date(),
      userId: user?.id ?? null,
    })
    .run()

  return newId
}

/**
 * Update stored credentials (for token refresh)
 */
function updateStoredCredentials(
  accountId: string,
  creds: {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
  }
): void {
  const encryptedToken = encryptToken(creds.accessToken)
  const encryptedRefreshToken = creds.refreshToken
    ? encryptToken(creds.refreshToken)
    : null
  const db = getDatabase()

  db.update(anthropicAccounts)
    .set({
      oauthToken: encryptedToken,
      refreshToken: encryptedRefreshToken,
      expiresAt: creds.expiresAt ?? null,
      lastUsedAt: new Date(),
    })
    .where(eq(anthropicAccounts.id, accountId))
    .run()

  // Also update legacy table
  db.update(claudeCodeCredentials)
    .set({
      oauthToken: encryptedToken,
    })
    .where(eq(claudeCodeCredentials.id, "default"))
    .run()
}

/**
 * Stored credentials with account ID for token refresh operations
 */
export interface StoredCredentials {
  accountId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
}

/**
 * Get stored OAuth credentials from the database (for token refresh)
 * Returns full credentials with account ID for refresh operations
 */
export function getStoredCredentials(): StoredCredentials | null {
  const db = getDatabase()

  // First try multi-account system
  const settings = db
    .select()
    .from(anthropicSettings)
    .where(eq(anthropicSettings.id, "singleton"))
    .get()

  if (settings?.activeAccountId) {
    const account = db
      .select()
      .from(anthropicAccounts)
      .where(eq(anthropicAccounts.id, settings.activeAccountId))
      .get()

    if (account?.oauthToken) {
      try {
        return {
          accountId: account.id,
          accessToken: decryptToken(account.oauthToken),
          refreshToken: account.refreshToken
            ? decryptToken(account.refreshToken)
            : null,
          expiresAt: account.expiresAt,
        }
      } catch (error) {
        console.error("[ClaudeCode] Failed to decrypt credentials:", error)
        return null
      }
    }
  }

  // Fallback to legacy table (no refresh token support)
  const cred = db
    .select()
    .from(claudeCodeCredentials)
    .where(eq(claudeCodeCredentials.id, "default"))
    .get()

  if (cred?.oauthToken) {
    try {
      return {
        accountId: "default",
        accessToken: decryptToken(cred.oauthToken),
        refreshToken: null,
        expiresAt: null,
      }
    } catch (error) {
      console.error("[ClaudeCode] Failed to decrypt legacy credentials:", error)
      return null
    }
  }

  return null
}

// Export updateStoredCredentials for use by claude.ts
export { updateStoredCredentials }

/**
 * Claude Code OAuth router for desktop
 * Uses server only for sandbox creation, stores token locally
 */
export const claudeCodeRouter = router({
  /**
   * Check if user has existing CLI config (API key or proxy)
   * If true, user can skip OAuth onboarding
   * Based on PR #29 by @sa4hnd
   */
  hasExistingCliConfig: publicProcedure.query(() => {
    const shellEnv = getClaudeShellEnvironment()
    const hasConfig = !!(shellEnv.ANTHROPIC_API_KEY || shellEnv.ANTHROPIC_BASE_URL)
    return {
      hasConfig,
      hasApiKey: !!shellEnv.ANTHROPIC_API_KEY,
      baseUrl: shellEnv.ANTHROPIC_BASE_URL || null,
    }
  }),

  /**
   * Get comprehensive connection status for CLI gate check
   * Checks if binary exists AND if credentials are configured
   */
  getConnectionStatus: publicProcedure.query(async () => {
    const { existsSync } = await import("fs")
    const { getBundledClaudeBinaryPath } = await import("../../claude")
    const binaryPath = getBundledClaudeBinaryPath()
    const binaryExists = existsSync(binaryPath)

    // Check shell env for API key/base URL
    const shellEnv = getClaudeShellEnvironment()
    const hasEnvConfig = !!(shellEnv.ANTHROPIC_API_KEY || shellEnv.ANTHROPIC_BASE_URL)

    // Check OAuth token (reuse logic from getIntegration)
    const db = getDatabase()
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get()

    let hasOAuthToken = false
    if (settings?.activeAccountId) {
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get()
      hasOAuthToken = !!account?.oauthToken
    }

    // Fallback to legacy table
    if (!hasOAuthToken) {
      const cred = db
        .select()
        .from(claudeCodeCredentials)
        .where(eq(claudeCodeCredentials.id, "default"))
        .get()
      hasOAuthToken = !!cred?.oauthToken
    }

    return {
      binaryExists,
      binaryPath,
      hasCredentials: hasOAuthToken || hasEnvConfig,
      credentialSource: hasOAuthToken ? "oauth" : hasEnvConfig ? "env" : null,
    }
  }),

  /**
   * Check if user has Claude Code connected (local check)
   * Now uses multi-account system - checks for active account
   */
  getIntegration: publicProcedure.query(() => {
    const db = getDatabase()

    // First try multi-account system
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get()

    if (settings?.activeAccountId) {
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get()

      if (account) {
        return {
          isConnected: true,
          connectedAt: account.connectedAt?.toISOString() ?? null,
          accountId: account.id,
          displayName: account.displayName,
        }
      }
    }

    // Fallback to legacy table
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    return {
      isConnected: !!cred?.oauthToken,
      connectedAt: cred?.connectedAt?.toISOString() ?? null,
      accountId: null,
      displayName: null,
    }
  }),

  /**
   * Start OAuth flow - calls server to create sandbox
   * Note: 21st.dev auth is optional - if not authenticated, we'll try without token
   */
  startAuth: publicProcedure.mutation(async () => {
    const token = await getDesktopToken()

    // Server creates sandbox (has CodeSandbox SDK)
    const headers: Record<string, string> = {}
    if (token) {
      headers["x-desktop-token"] = token
    }

    const response = await fetch(`${getApiUrl()}/api/auth/claude-code/start`, {
      method: "POST",
      headers,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(error.error || `Start auth failed: ${response.status}`)
    }

    return (await response.json()) as {
      sandboxId: string
      sandboxUrl: string
      sessionId: string
    }
  }),

  /**
   * Poll for OAuth URL - calls sandbox directly
   */
  pollStatus: publicProcedure
    .input(
      z.object({
        sandboxUrl: z.string(),
        sessionId: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const response = await fetch(
          `${input.sandboxUrl}/api/auth/${input.sessionId}/status`
        )

        if (!response.ok) {
          return { state: "error" as const, oauthUrl: null, error: "Failed to poll status" }
        }

        const data = await response.json()
        return {
          state: data.state as string,
          oauthUrl: data.oauthUrl ?? null,
          error: data.error ?? null,
        }
      } catch (error) {
        console.error("[ClaudeCode] Poll status error:", error)
        return { state: "error" as const, oauthUrl: null, error: "Connection failed" }
      }
    }),

  /**
   * Submit OAuth code - calls sandbox directly, stores token locally
   */
  submitCode: publicProcedure
    .input(
      z.object({
        sandboxUrl: z.string(),
        sessionId: z.string(),
        code: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      // Submit code to sandbox
      const codeRes = await fetch(
        `${input.sandboxUrl}/api/auth/${input.sessionId}/code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: input.code }),
        }
      )

      if (!codeRes.ok) {
        throw new Error(`Code submission failed: ${codeRes.statusText}`)
      }

      // Poll for OAuth token (max 10 seconds)
      let oauthToken: string | null = null

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000))

        const statusRes = await fetch(
          `${input.sandboxUrl}/api/auth/${input.sessionId}/status`
        )

        if (!statusRes.ok) continue

        const status = await statusRes.json()

        if (status.state === "success" && status.oauthToken) {
          oauthToken = status.oauthToken
          break
        }

        if (status.state === "error") {
          throw new Error(status.error || "Authentication failed")
        }
      }

      if (!oauthToken) {
        throw new Error("Timeout waiting for OAuth token")
      }

      storeOAuthCredentials({ accessToken: oauthToken })

      console.log("[ClaudeCode] Token stored locally")
      return { success: true }
    }),

  /**
   * Import an existing OAuth token from the local machine
   */
  importToken: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const oauthToken = input.token.trim()

      storeOAuthCredentials({ accessToken: oauthToken })

      console.log("[ClaudeCode] Token imported locally")
      return { success: true }
    }),

  /**
   * Check for existing Claude credentials in system keychain
   * Returns full credential info including whether refresh token is available
   */
  getSystemToken: publicProcedure.query(() => {
    const creds = getExistingClaudeCredentials()
    return {
      token: creds?.accessToken?.trim() ?? null,
      hasRefreshToken: !!creds?.refreshToken,
      expiresAt: creds?.expiresAt ?? null,
    }
  }),

  /**
   * Import Claude credentials from system keychain (full credentials with refresh token)
   */
  importSystemToken: publicProcedure.mutation(() => {
    const creds = getExistingClaudeCredentials()
    if (!creds?.accessToken) {
      throw new Error("No existing Claude credentials found. Run 'claude login' in your terminal first.")
    }

    storeOAuthCredentials({
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
    })
    console.log("[ClaudeCode] Full credentials imported from system (with refresh token)")
    return { success: true }
  }),

  /**
   * Get decrypted OAuth token (local)
   * Now uses multi-account system - gets token from active account
   */
  getToken: publicProcedure.query(() => {
    const db = getDatabase()

    // First try multi-account system
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get()

    if (settings?.activeAccountId) {
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get()

      if (account) {
        try {
          const token = decryptToken(account.oauthToken)
          return { token, error: null }
        } catch (error) {
          console.error("[ClaudeCode] Decrypt error:", error)
          return { token: null, error: "Failed to decrypt token" }
        }
      }
    }

    // Fallback to legacy table
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!cred?.oauthToken) {
      return { token: null, error: "Not connected" }
    }

    try {
      const token = decryptToken(cred.oauthToken)
      return { token, error: null }
    } catch (error) {
      console.error("[ClaudeCode] Decrypt error:", error)
      return { token: null, error: "Failed to decrypt token" }
    }
  }),

  /**
   * Disconnect - delete active account from multi-account system
   */
  disconnect: publicProcedure.mutation(() => {
    const db = getDatabase()

    // Get active account
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get()

    if (settings?.activeAccountId) {
      // Remove active account
      db.delete(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .run()

      // Try to set another account as active
      const firstRemaining = db.select().from(anthropicAccounts).limit(1).get()

      if (firstRemaining) {
        db.update(anthropicSettings)
          .set({
            activeAccountId: firstRemaining.id,
            updatedAt: new Date(),
          })
          .where(eq(anthropicSettings.id, "singleton"))
          .run()
      } else {
        db.update(anthropicSettings)
          .set({
            activeAccountId: null,
            updatedAt: new Date(),
          })
          .where(eq(anthropicSettings.id, "singleton"))
          .run()
      }
    }

    // Also clear legacy table
    db.delete(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .run()

    console.log("[ClaudeCode] Disconnected")
    return { success: true }
  }),

  /**
   * Open OAuth URL in browser
   */
  openOAuthUrl: publicProcedure
    .input(z.string())
    .mutation(async ({ input: url }) => {
      await shell.openExternal(url)
      return { success: true }
    }),
})
