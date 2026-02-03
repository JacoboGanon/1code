"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
import { trpc, trpcClient } from "../../../lib/trpc"
import {
  agentsDiffSidebarWidthAtom,
  diffSidebarOpenAtomFamily,
  diffViewDisplayModeAtom,
  filteredSubChatIdAtom,
  isCreatingPrAtom,
  pendingPrMessageAtom,
  pendingReviewMessageAtom,
  workspaceDiffCacheAtomFamily,
} from "../atoms"
import { DiffCenterPeekDialog } from "../../changes/components/diff-center-peek-dialog"
import { DiffFullPageView } from "../../changes/components/diff-full-page-view"
import { DiffSidebarHeader } from "../../changes/components/diff-sidebar-header"
import { DiffSidebarContent } from "../../changes/diff-sidebar/diff-sidebar-content"
import { DiffStateProvider, useDiffState } from "../../changes/diff-sidebar/diff-state"
import { generatePrMessage, generateReviewMessage } from "../utils/pr-message"
import { diffViewModeAtom, splitUnifiedDiffByFile, type ParsedDiffFile, type DiffViewMode, type AgentDiffViewRef } from "../ui/agent-diff-view"
import { isDesktopAtom, isFullscreenAtom } from "../../../lib/atoms"

interface PaneDiffSidebarProps {
  projectId: string
  projectPath: string
  focusedSubChatId: string | null
}

export const PaneDiffSidebar = memo(function PaneDiffSidebar({
  projectId,
  projectPath,
  focusedSubChatId,
}: PaneDiffSidebarProps) {
  const diffKey = useMemo(() => `project:${projectId}`, [projectId])
  const [isDiffSidebarOpen, setIsDiffSidebarOpen] = useAtom(diffSidebarOpenAtomFamily(diffKey))
  const [diffDisplayMode, setDiffDisplayMode] = useAtom(diffViewDisplayModeAtom)
  const diffSidebarWidth = useAtomValue(agentsDiffSidebarWidthAtom)
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)

  const diffCacheAtom = useMemo(() => workspaceDiffCacheAtomFamily(diffKey), [diffKey])
  const [diffCache, setDiffCache] = useAtom(diffCacheAtom)

  const diffStats = diffCache.diffStats
  const parsedFileDiffs = diffCache.parsedFileDiffs as ParsedDiffFile[] | null
  const prefetchedFileContents = diffCache.prefetchedFileContents
  const diffContent = diffCache.diffContent

  const setDiffStats = useCallback((stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => {
    setDiffCache((prev) => ({ ...prev, diffStats: stats }))
  }, [setDiffCache])

  const setParsedFileDiffs = useCallback((files: ParsedDiffFile[] | null) => {
    setDiffCache((prev) => ({ ...prev, parsedFileDiffs: files }))
  }, [setDiffCache])

  const setPrefetchedFileContents = useCallback((contents: Record<string, string>) => {
    setDiffCache((prev) => ({ ...prev, prefetchedFileContents: contents }))
  }, [setDiffCache])

  const setDiffContent = useCallback((content: string | null) => {
    setDiffCache((prev) => ({ ...prev, diffContent: content }))
  }, [setDiffCache])

  const isFetchingDiffRef = useRef(false)

  const fetchDiffStats = useCallback(async () => {
    if (!projectId || !projectPath) return
    if (isFetchingDiffRef.current) return
    isFetchingDiffRef.current = true

    setDiffCache((prev) => ({
      ...prev,
      diffStats: { ...prev.diffStats, isLoading: true },
    }))

    try {
      const result = await trpcClient.chats.getProjectDiff.query({ projectId })
      const rawDiff = result.diff || ""

      if (!rawDiff.trim()) {
        setParsedFileDiffs([])
        setPrefetchedFileContents({})
        setDiffContent(null)
        setDiffStats({
          fileCount: 0,
          additions: 0,
          deletions: 0,
          isLoading: false,
          hasChanges: false,
        })
        return
      }

      const files = splitUnifiedDiffByFile(rawDiff)
      const additions = files.reduce((sum, f) => sum + f.additions, 0)
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0)

      setParsedFileDiffs(files)
      setPrefetchedFileContents({})
      setDiffContent(null)
      setDiffStats({
        fileCount: files.length,
        additions,
        deletions,
        isLoading: false,
        hasChanges: files.length > 0,
      })
    } catch (error) {
      console.error("[PaneDiffSidebar] Failed to fetch diff:", error)
      setDiffStats({
        fileCount: 0,
        additions: 0,
        deletions: 0,
        isLoading: false,
        hasChanges: false,
      })
    } finally {
      isFetchingDiffRef.current = false
    }
  }, [projectId, projectPath, setDiffCache, setDiffStats, setParsedFileDiffs, setPrefetchedFileContents, setDiffContent])

  useEffect(() => {
    fetchDiffStats()
  }, [fetchDiffStats])

  useEffect(() => {
    if (isDiffSidebarOpen) {
      fetchDiffStats()
    }
  }, [isDiffSidebarOpen, fetchDiffStats])

  const diffViewRef = useRef<AgentDiffViewRef | null>(null)
  const [, setDiffCollapseState] = useState({ allCollapsed: false, allExpanded: false })
  const [diffMode, setDiffMode] = useAtom(diffViewModeAtom)

  const handleExpandAll = useCallback(() => {
    diffViewRef.current?.expandAll()
  }, [])

  const handleCollapseAll = useCallback(() => {
    diffViewRef.current?.collapseAll()
  }, [])

  const handleMarkAllViewed = useCallback(() => {
    diffViewRef.current?.markAllViewed()
  }, [])

  const handleMarkAllUnviewed = useCallback(() => {
    diffViewRef.current?.markAllUnviewed()
  }, [])

  const [isCreatingPr, setIsCreatingPr] = useAtom(isCreatingPrAtom)
  const [isCreatingPrDirect, setIsCreatingPrDirect] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const setPendingPrMessage = useSetAtom(pendingPrMessageAtom)
  const setPendingReviewMessage = useSetAtom(pendingReviewMessageAtom)
  const setFilteredSubChatId = useSetAtom(filteredSubChatIdAtom)

  const createPrMutation = trpc.changes.createPR.useMutation()

  const handleCreatePrDirect = useCallback(async () => {
    if (!projectPath) {
      toast.error("No workspace path available", { position: "top-center" })
      return
    }

    setIsCreatingPrDirect(true)
    try {
      await createPrMutation.mutateAsync({ worktreePath: projectPath })
    } finally {
      setIsCreatingPrDirect(false)
    }
  }, [projectPath, createPrMutation])

  const handleCreatePrWithAI = useCallback(async () => {
    if (!focusedSubChatId) {
      toast.error("Focus a pane to create a PR with AI", { position: "top-center" })
      return
    }

    setIsCreatingPr(true)
    try {
      const context = await trpcClient.chats.getProjectPrContext.query({ projectId })
      if (!context) {
        toast.error("Could not get git context", { position: "top-center" })
        setIsCreatingPr(false)
        return
      }

      const message = generatePrMessage(context)
      setPendingPrMessage(message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to prepare PR request", { position: "top-center" })
      setIsCreatingPr(false)
    }
  }, [focusedSubChatId, projectId, setPendingPrMessage, setIsCreatingPr])

  const handleReview = useCallback(async () => {
    if (!focusedSubChatId) {
      toast.error("Focus a pane to review changes", { position: "top-center" })
      return
    }

    setIsReviewing(true)
    try {
      const context = await trpcClient.chats.getProjectPrContext.query({ projectId })
      if (!context) {
        toast.error("Could not get git context", { position: "top-center" })
        return
      }

      setFilteredSubChatId(focusedSubChatId)
      const message = generateReviewMessage(context)
      setPendingReviewMessage(message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start review", { position: "top-center" })
    } finally {
      setIsReviewing(false)
    }
  }, [focusedSubChatId, projectId, setFilteredSubChatId, setPendingReviewMessage])

  const { data: branchData } = trpc.changes.getBranches.useQuery(
    { worktreePath: projectPath || "" },
    { enabled: !!projectPath }
  )

  const { data: gitStatus, refetch: refetchGitStatus, isLoading: isGitStatusLoading } = trpc.changes.getStatus.useQuery(
    { worktreePath: projectPath || "" },
    { enabled: !!projectPath && isDiffSidebarOpen, staleTime: 30000 }
  )

  const handleRefreshGitStatus = useCallback(() => {
    refetchGitStatus()
    fetchDiffStats()
  }, [refetchGitStatus, fetchDiffStats])

  const effectiveWidth = diffDisplayMode === "side-peek"
    ? diffSidebarWidth
    : diffDisplayMode === "center-peek"
      ? 1200
      : typeof window !== "undefined" ? window.innerWidth : 1200

  const isDiffSidebarNarrow = effectiveWidth < 500

  return (
    <DiffStateProvider
      isDiffSidebarOpen={isDiffSidebarOpen}
      parsedFileDiffs={parsedFileDiffs}
      isDiffSidebarNarrow={isDiffSidebarNarrow}
      setIsDiffSidebarOpen={setIsDiffSidebarOpen}
      setDiffStats={setDiffStats}
      setDiffContent={setDiffContent}
      setParsedFileDiffs={setParsedFileDiffs}
      setPrefetchedFileContents={setPrefetchedFileContents}
      fetchDiffStats={fetchDiffStats}
    >
      <PaneDiffShell
        diffDisplayMode={diffDisplayMode}
        isDiffSidebarOpen={isDiffSidebarOpen}
        effectiveWidth={effectiveWidth}
        diffStats={diffStats}
        projectPath={projectPath}
        branchData={branchData}
        gitStatus={gitStatus}
        isGitStatusLoading={isGitStatusLoading}
        isReviewing={isReviewing}
        isCreatingPr={isCreatingPrDirect}
        onReview={handleReview}
        onCreatePrDirect={handleCreatePrDirect}
        onCreatePrWithAI={handleCreatePrWithAI}
        onRefresh={handleRefreshGitStatus}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        diffMode={diffMode}
        setDiffMode={setDiffMode}
        onMarkAllViewed={handleMarkAllViewed}
        onMarkAllUnviewed={handleMarkAllUnviewed}
        isDesktop={isDesktop}
        isFullscreen={isFullscreen}
        setDiffDisplayMode={setDiffDisplayMode}
        diffViewRef={diffViewRef}
        diffKey={diffKey}
        projectId={projectId}
        focusedSubChatId={focusedSubChatId}
        diffContent={diffContent}
        parsedFileDiffs={parsedFileDiffs}
        prefetchedFileContents={prefetchedFileContents}
        setDiffCollapseState={setDiffCollapseState}
        setDiffStats={setDiffStats}
      />
    </DiffStateProvider>
  )
})

interface PaneDiffShellProps {
  diffDisplayMode: "side-peek" | "center-peek" | "full-page"
  isDiffSidebarOpen: boolean
  effectiveWidth: number
  diffStats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }
  projectPath: string
  branchData: { current: string } | undefined
  gitStatus: { pushCount?: number; pullCount?: number; hasUpstream?: boolean; ahead?: number; behind?: number } | undefined
  isGitStatusLoading: boolean
  isReviewing: boolean
  isCreatingPr: boolean
  onReview: () => void
  onCreatePrDirect: () => void
  onCreatePrWithAI: () => void
  onRefresh: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  diffMode: DiffViewMode
  setDiffMode: (mode: DiffViewMode) => void
  onMarkAllViewed: () => void
  onMarkAllUnviewed: () => void
  isDesktop: boolean
  isFullscreen: boolean
  setDiffDisplayMode: (mode: "side-peek" | "center-peek" | "full-page") => void
  diffViewRef: React.RefObject<AgentDiffViewRef | null>
  diffKey: string
  projectId: string
  focusedSubChatId: string | null
  diffContent: string | null
  parsedFileDiffs: ParsedDiffFile[] | null
  prefetchedFileContents: Record<string, string>
  setDiffCollapseState: (state: { allCollapsed: boolean; allExpanded: boolean }) => void
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
}

const PaneDiffShell = memo(function PaneDiffShell({
  diffDisplayMode,
  isDiffSidebarOpen,
  effectiveWidth,
  diffStats,
  projectPath,
  branchData,
  gitStatus,
  isGitStatusLoading,
  isReviewing,
  isCreatingPr,
  onReview,
  onCreatePrDirect,
  onCreatePrWithAI,
  onRefresh,
  onExpandAll,
  onCollapseAll,
  diffMode,
  setDiffMode,
  onMarkAllViewed,
  onMarkAllUnviewed,
  isDesktop,
  isFullscreen,
  setDiffDisplayMode,
  diffViewRef,
  diffKey,
  projectId,
  focusedSubChatId,
  diffContent,
  parsedFileDiffs,
  prefetchedFileContents,
  setDiffCollapseState,
  setDiffStats,
}: PaneDiffShellProps) {
  const { handleCloseDiff, viewedCount } = useDiffState()

  const diffViewContent = (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      <DiffSidebarHeader
        worktreePath={projectPath}
        currentBranch={branchData?.current ?? ""}
        diffStats={diffStats}
        sidebarWidth={effectiveWidth}
        pushCount={gitStatus?.pushCount ?? 0}
        pullCount={gitStatus?.pullCount ?? 0}
        hasUpstream={gitStatus?.hasUpstream ?? true}
        isSyncStatusLoading={isGitStatusLoading}
        aheadOfDefault={gitStatus?.ahead ?? 0}
        behindDefault={gitStatus?.behind ?? 0}
        onReview={onReview}
        isReviewing={isReviewing}
        onCreatePr={onCreatePrDirect}
        isCreatingPr={isCreatingPr}
        onCreatePrWithAI={onCreatePrWithAI}
        isCreatingPrWithAI={isCreatingPr}
        onMergePr={undefined}
        isMergingPr={false}
        onClose={handleCloseDiff}
        onRefresh={onRefresh}
        hasPrNumber={false}
        isPrOpen={false}
        hasMergeConflicts={false}
        onFixConflicts={undefined}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        viewMode={diffMode}
        onViewModeChange={setDiffMode}
        viewedCount={viewedCount}
        onMarkAllViewed={onMarkAllViewed}
        onMarkAllUnviewed={onMarkAllUnviewed}
        isDesktop={isDesktop}
        isFullscreen={isFullscreen}
        displayMode={diffDisplayMode}
        onDisplayModeChange={setDiffDisplayMode}
      />

      <DiffSidebarContent
        worktreePath={projectPath}
        diffStateKey={diffKey}
        aiChatId={focusedSubChatId ?? undefined}
        projectId={projectId}
        sandboxId={null}
        repository={null}
        setDiffStats={setDiffStats}
        diffContent={diffContent}
        parsedFileDiffs={parsedFileDiffs}
        prefetchedFileContents={prefetchedFileContents}
        setDiffCollapseState={setDiffCollapseState}
        diffViewRef={diffViewRef}
        sidebarWidth={effectiveWidth}
        onCreatePr={onCreatePrDirect}
        subChats={[]}
      />
    </div>
  )

  if (diffDisplayMode === "side-peek") {
    return (
      <ResizableSidebar
        isOpen={isDiffSidebarOpen}
        onClose={handleCloseDiff}
        widthAtom={agentsDiffSidebarWidthAtom}
        minWidth={320}
        side="right"
        animationDuration={0}
        initialWidth={0}
        exitWidth={0}
        showResizeTooltip={true}
        className="bg-background border-l"
        style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
      >
        {diffViewContent}
      </ResizableSidebar>
    )
  }

  if (diffDisplayMode === "center-peek") {
    return (
      <DiffCenterPeekDialog isOpen={isDiffSidebarOpen} onClose={handleCloseDiff}>
        {diffViewContent}
      </DiffCenterPeekDialog>
    )
  }

  if (diffDisplayMode === "full-page") {
    return (
      <DiffFullPageView isOpen={isDiffSidebarOpen} onClose={handleCloseDiff}>
        {diffViewContent}
      </DiffFullPageView>
    )
  }

  return null
})
