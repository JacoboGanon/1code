import { z } from "zod"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"
import { terminalManager } from "../../terminal/manager"
import { getDatabase, projects } from "../../db"
import { eq } from "drizzle-orm"
import type { TerminalEvent } from "../../terminal/types"

/**
 * Get the paneId used for dev server terminal sessions
 */
function getDevServerPaneId(projectId: string): string {
  return `devserver:${projectId}`
}

export const devServerRouter = router({
  /**
   * Start the dev server for a project
   */
  start: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()

      if (!project) {
        throw new Error("Project not found")
      }

      if (!project.devServerCommand) {
        throw new Error("No dev server command configured")
      }

      const paneId = getDevServerPaneId(input.projectId)

      // Check if already running
      const existing = terminalManager.getSession(paneId)
      if (existing?.isAlive) {
        return { status: "already_running" as const, paneId }
      }

      // Create terminal session
      await terminalManager.createOrAttach({
        paneId,
        workspaceId: input.projectId,
        cwd: project.path,
        cols: 120,
        rows: 30,
        initialCommands: [project.devServerCommand],
      })

      return { status: "started" as const, paneId }
    }),

  /**
   * Stop the dev server for a project
   */
  stop: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const paneId = getDevServerPaneId(input.projectId)

      const session = terminalManager.getSession(paneId)
      if (!session?.isAlive) {
        return { status: "not_running" as const }
      }

      // Send SIGTERM first (graceful shutdown)
      terminalManager.signal({ paneId, signal: "SIGTERM" })

      // Wait a bit for graceful shutdown, then force kill if needed
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const stillAlive = terminalManager.getSession(paneId)
      if (stillAlive?.isAlive) {
        // Force kill
        terminalManager.signal({ paneId, signal: "SIGKILL" })
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      // Clean up the session
      await terminalManager.kill({ paneId })

      return { status: "stopped" as const }
    }),

  /**
   * Restart the dev server for a project
   */
  restart: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const paneId = getDevServerPaneId(input.projectId)

      // Stop if running
      const session = terminalManager.getSession(paneId)
      if (session?.isAlive) {
        terminalManager.signal({ paneId, signal: "SIGTERM" })
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const stillAlive = terminalManager.getSession(paneId)
        if (stillAlive?.isAlive) {
          terminalManager.signal({ paneId, signal: "SIGKILL" })
          await new Promise((resolve) => setTimeout(resolve, 500))
        }

        await terminalManager.kill({ paneId })
      }

      // Small delay before restarting
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Start again
      const db = getDatabase()
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()

      if (!project) {
        throw new Error("Project not found")
      }

      if (!project.devServerCommand) {
        throw new Error("No dev server command configured")
      }

      await terminalManager.createOrAttach({
        paneId,
        workspaceId: input.projectId,
        cwd: project.path,
        cols: 120,
        rows: 30,
        initialCommands: [project.devServerCommand],
      })

      return { status: "restarted" as const, paneId }
    }),

  /**
   * Get the current status of the dev server
   */
  getStatus: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => {
      const paneId = getDevServerPaneId(input.projectId)
      const session = terminalManager.getSession(paneId)

      if (!session || !session.isAlive) {
        return { status: "stopped" as const, paneId }
      }

      return { status: "running" as const, paneId }
    }),

  /**
   * Get the paneId for the dev server terminal
   */
  getPaneId: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => {
      return getDevServerPaneId(input.projectId)
    }),

  /**
   * Subscribe to dev server output
   */
  stream: publicProcedure
    .input(z.string()) // projectId
    .subscription(({ input: projectId }) => {
      const paneId = getDevServerPaneId(projectId)

      return observable<TerminalEvent>((emit) => {
        const onData = (data: string) => {
          emit.next({ type: "data", data })
        }

        const onExit = (exitCode: number, signal?: number) => {
          emit.next({ type: "exit", exitCode, signal })
        }

        terminalManager.on(`data:${paneId}`, onData)
        terminalManager.on(`exit:${paneId}`, onExit)

        return () => {
          terminalManager.off(`data:${paneId}`, onData)
          terminalManager.off(`exit:${paneId}`, onExit)
        }
      })
    }),

  /**
   * Write to dev server terminal (for interactive input)
   */
  write: publicProcedure
    .input(z.object({ projectId: z.string(), data: z.string() }))
    .mutation(({ input }) => {
      const paneId = getDevServerPaneId(input.projectId)
      terminalManager.write({ paneId, data: input.data })
    }),

  /**
   * Resize the dev server terminal
   */
  resize: publicProcedure
    .input(z.object({ projectId: z.string(), cols: z.number(), rows: z.number() }))
    .mutation(({ input }) => {
      const paneId = getDevServerPaneId(input.projectId)
      terminalManager.resize({ paneId, cols: input.cols, rows: input.rows })
    }),
})
