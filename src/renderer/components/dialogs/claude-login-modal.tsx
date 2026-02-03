"use client"

import { useAtom, useSetAtom } from "jotai"
import { Check, Terminal, X } from "lucide-react"
import { useEffect, useState } from "react"
import { pendingAuthRetryMessageAtom } from "../../features/agents/atoms"
import {
  agentsLoginModalOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  type SettingsTab,
} from "../../lib/atoms"
import { appStore } from "../../lib/jotai-store"
import { trpc } from "../../lib/trpc"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
} from "../ui/alert-dialog"
import { Button } from "../ui/button"
import { ClaudeCodeIcon, IconSpinner } from "../ui/icons"
import { Logo } from "../ui/logo"

type AuthFlowState =
  | { step: "idle" }
  | { step: "checking" } // Checking for CLI token
  | { step: "has_cli_token" } // CLI token available, ready to import
  | { step: "no_cli_token" } // No CLI token, show instructions
  | { step: "importing" } // Importing token
  | { step: "success" } // Import successful
  | { step: "error"; message: string }

export function ClaudeLoginModal() {
  const [open, setOpen] = useAtom(agentsLoginModalOpenAtom)
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const [flowState, setFlowState] = useState<AuthFlowState>({ step: "idle" })

  // tRPC queries and mutations
  const systemTokenQuery = trpc.claudeCode.getSystemToken.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  })
  const importSystemTokenMutation = trpc.claudeCode.importSystemToken.useMutation()

  // Check for CLI token when modal opens
  useEffect(() => {
    if (open && flowState.step === "idle") {
      setFlowState({ step: "checking" })
    }
  }, [open, flowState.step])

  // Update flow state based on system token query
  useEffect(() => {
    if (flowState.step === "checking" && !systemTokenQuery.isLoading) {
      if (systemTokenQuery.data?.token) {
        setFlowState({ step: "has_cli_token" })
      } else {
        setFlowState({ step: "no_cli_token" })
      }
    }
  }, [flowState.step, systemTokenQuery.isLoading, systemTokenQuery.data])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setFlowState({ step: "idle" })
    }
  }, [open])

  // Helper to trigger retry after successful import
  const triggerAuthRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (pending) {
      console.log("[ClaudeLoginModal] Import success - triggering retry for subChatId:", pending.subChatId)
      appStore.set(pendingAuthRetryMessageAtom, { ...pending, readyToRetry: true })
    }
  }

  // Helper to clear pending retry (on cancel/close without success)
  const clearPendingRetry = () => {
    const pending = appStore.get(pendingAuthRetryMessageAtom)
    if (pending && !pending.readyToRetry) {
      console.log("[ClaudeLoginModal] Modal closed without success - clearing pending retry")
      appStore.set(pendingAuthRetryMessageAtom, null)
    }
  }

  const handleImportFromCli = async () => {
    setFlowState({ step: "importing" })
    try {
      await importSystemTokenMutation.mutateAsync()
      setFlowState({ step: "success" })
      // Auto-close after brief success state
      setTimeout(() => {
        triggerAuthRetry()
        setOpen(false)
      }, 800)
    } catch (err) {
      setFlowState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to import credentials",
      })
    }
  }

  const handleRetry = () => {
    // Refetch system token and reset state
    systemTokenQuery.refetch()
    setFlowState({ step: "checking" })
  }

  const handleOpenModelsSettings = () => {
    clearPendingRetry()
    setSettingsActiveTab("models" as SettingsTab)
    setSettingsOpen(true)
    setOpen(false)
  }

  // Handle modal open/close - clear pending retry if closing without success
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      clearPendingRetry()
    }
    setOpen(newOpen)
  }

  const isLoading = flowState.step === "checking" || flowState.step === "importing"

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="w-[380px] p-6">
        {/* Close button */}
        <AlertDialogCancel className="absolute right-4 top-4 h-6 w-6 p-0 border-0 bg-transparent hover:bg-muted rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </AlertDialogCancel>

        <div className="space-y-8">
          {/* Header with dual icons */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Logo className="w-5 h-5" fill="white" />
              </div>
              <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center">
                <ClaudeCodeIcon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-semibold tracking-tight">
                Claude Code
              </h1>
              <p className="text-sm text-muted-foreground">
                Connect your Claude Code subscription
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Loading State */}
            {flowState.step === "checking" && (
              <div className="flex items-center justify-center py-4">
                <IconSpinner className="h-6 w-6" />
              </div>
            )}

            {/* CLI Token Available - Import Button */}
            {flowState.step === "has_cli_token" && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Claude CLI detected</p>
                      <p className="text-xs text-muted-foreground">
                        Found existing credentials from Claude CLI
                      </p>
                    </div>
                  </div>
                </div>
                <Button onClick={handleImportFromCli} className="w-full">
                  Import from Claude CLI
                </Button>
              </div>
            )}

            {/* No CLI Token - Instructions */}
            {flowState.step === "no_cli_token" && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 border border-border rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Terminal className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">No credentials found</p>
                      <p className="text-xs text-muted-foreground">
                        Run the following command in your terminal first:
                      </p>
                      <code className="block text-xs bg-background px-2 py-1.5 rounded font-mono border">
                        claude login
                      </code>
                      <p className="text-xs text-muted-foreground">
                        Then come back and click "Retry"
                      </p>
                    </div>
                  </div>
                </div>
                <Button onClick={handleRetry} className="w-full">
                  Retry
                </Button>
              </div>
            )}

            {/* Importing State */}
            {flowState.step === "importing" && (
              <div className="flex items-center justify-center py-4">
                <IconSpinner className="h-6 w-6" />
              </div>
            )}

            {/* Success State */}
            {flowState.step === "success" && (
              <div className="flex items-center justify-center py-4">
                <div className="flex items-center gap-2 text-green-500">
                  <Check className="w-5 h-5" />
                  <span className="text-sm font-medium">Connected!</span>
                </div>
              </div>
            )}

            {/* Error State */}
            {flowState.step === "error" && (
              <div className="space-y-4">
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{flowState.message}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleRetry}
                  className="w-full"
                >
                  Try Again
                </Button>
              </div>
            )}

            <div className="text-center !mt-2">
              <button
                type="button"
                onClick={handleOpenModelsSettings}
                className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Set a custom API key in Settings
              </button>
            </div>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
