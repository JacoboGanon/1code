/**
 * Type declarations for web backend API (21st.dev)
 * This file stubs the AppRouter type for the remote tRPC client
 * when the web backend module is not available locally.
 */

declare module "../../../../web/server/api/root" {
  import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"

  // Stub AppRouter type - represents the web backend's tRPC router
  // The actual types come from the web backend, but we only use a subset
  export type AppRouter = {
    teams: {
      getUserTeams: {
        query: () => Promise<Array<{ id: string; name: string }>>
      }
    }
    agents: {
      getAgentChats: {
        query: (input: { teamId: string }) => Promise<unknown[]>
      }
      getAgentChat: {
        query: (input: { chatId: string }) => Promise<unknown>
      }
    }
  }

  export type RouterInputs = inferRouterInputs<AppRouter>
  export type RouterOutputs = inferRouterOutputs<AppRouter>
}
