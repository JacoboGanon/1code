/**
 * Analytics stub - PostHog removed
 * All functions are no-ops
 */

export async function initAnalytics() {}

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

export function shutdown() {}

export function trackMessageSent(_data: {
  workspaceId: string
  messageLength: number
  mode: "plan" | "agent"
}) {}
