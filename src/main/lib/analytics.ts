/**
 * Analytics stub - PostHog removed
 * All functions are no-ops
 */

export function setOptOut(_optedOut: boolean) {}

export function setSubscriptionPlan(_plan: string) {}

export function setConnectionMethod(_method: string) {}

export function initAnalytics() {}

export function capture(
  _eventName: string,
  _properties?: Record<string, any>,
) {}

export function identify(
  _userId: string,
  _traits?: Record<string, any>,
) {}

export function getCurrentUserId(): string | null {
  return null
}

export function reset() {}

export async function shutdown() {}

export function trackAppOpened() {}

export function trackAuthCompleted(_userId: string, _email?: string) {}

export function trackProjectOpened(_project: {
  id: string
  hasGitRemote: boolean
}) {}

export function trackWorkspaceCreated(_workspace: {
  id: string
  projectId: string
  useWorktree: boolean
  repository?: string
}) {}

export function trackWorkspaceArchived(_workspaceId: string) {}

export function trackWorkspaceDeleted(_workspaceId: string) {}

export function trackMessageSent(_data: {
  workspaceId: string
  subChatId?: string
  mode: "plan" | "agent"
}) {}

export function trackPRCreated(_data: {
  workspaceId: string
  prNumber: number
  repository?: string
  mode?: "worktree" | "local"
}) {}

export function trackCommitCreated(_data: {
  workspaceId: string
  filesChanged: number
  mode: "worktree" | "local"
}) {}

export function trackSubChatCreated(_data: {
  workspaceId: string
  subChatId: string
}) {}
