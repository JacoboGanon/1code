"use client"

import { useAtom } from "jotai"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { FileStatus } from "../../../shared/changes-types"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import {
  agentsChangesPanelWidthAtom,
  selectedCommitAtom,
  type SelectedCommit,
} from "../../agents/atoms"
import { AgentDiffView, type AgentDiffViewRef, type ParsedDiffFile } from "../../agents/ui/agent-diff-view"
import { ChangesPanel } from "../changes-panel"
import { getStatusIndicator } from "../utils/status"
import { useDiffState } from "./diff-state"

interface DiffSidebarContentProps {
  worktreePath: string | null
  diffStateKey: string
  aiChatId?: string
  projectId?: string
  sandboxId: string | null
  repository: { owner: string; name: string } | null
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
  diffContent: string | null
  parsedFileDiffs: ParsedDiffFile[] | null
  prefetchedFileContents: Record<string, string> | undefined
  setDiffCollapseState: (state: { allCollapsed: boolean; allExpanded: boolean }) => void
  diffViewRef: React.RefObject<AgentDiffViewRef | null>
  sidebarWidth: number
  onCreatePr?: () => void
  onCommitSuccess?: () => void
  subChats?: Array<{ id: string; name: string; filePaths: string[]; fileCount: number }>
  initialSubChatFilter?: string | null
  onSelectNextFile?: (filePath: string) => void
}

const CommitFileItem = memo(function CommitFileItem({
  file,
  onClick,
}: {
  file: { path: string; status: FileStatus }
  onClick: () => void
}) {
  const fileName = file.path.split("/").pop() || file.path
  const dirPath = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : ""

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors",
        "hover:bg-muted/80"
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 flex items-center overflow-hidden">
        {dirPath && (
          <span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
            {dirPath}/
          </span>
        )}
        <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
          {fileName}
        </span>
      </div>
      <div className="shrink-0">{getStatusIndicator(file.status)}</div>
    </div>
  )
})

export const DiffSidebarContent = memo(function DiffSidebarContent({
  worktreePath,
  diffStateKey,
  aiChatId,
  projectId,
  sandboxId,
  repository,
  setDiffStats,
  diffContent,
  parsedFileDiffs,
  prefetchedFileContents,
  setDiffCollapseState,
  diffViewRef,
  sidebarWidth,
  onCreatePr,
  subChats = [],
}: DiffSidebarContentProps) {
  const {
    selectedFilePath,
    filteredSubChatId,
    handleDiffFileSelect,
    handleSelectNextFile,
    handleCommitSuccess,
    handleViewedCountChange,
    resetActiveTabRef,
  } = useDiffState()

  const initialSelectedFile = useMemo(() => {
    if (selectedFilePath) return selectedFilePath
    if (parsedFileDiffs && parsedFileDiffs.length > 0) {
      const firstFile = parsedFileDiffs[0]
      const filePath = firstFile.newPath !== "/dev/null" ? firstFile.newPath : firstFile.oldPath
      if (filePath && filePath !== "/dev/null") {
        return filePath
      }
    }
    return null
  }, [selectedFilePath, parsedFileDiffs])

  const [changesPanelWidth, setChangesPanelWidth] = useAtom(agentsChangesPanelWidthAtom)

  const [activeTab, setActiveTab] = useState<"changes" | "history">("changes")

  useEffect(() => {
    resetActiveTabRef.current = () => setActiveTab("changes")
    return () => {
      resetActiveTabRef.current = null
    }
  }, [resetActiveTabRef])

  const [selectedCommit, setSelectedCommit] = useAtom(selectedCommitAtom)

  const isNarrow = sidebarWidth < 500

  const { data: diffStatus } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath && isNarrow }
  )

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = changesPanelWidth
      const pointerId = event.pointerId
      const handleElement = event.currentTarget as HTMLElement

      const minWidth = 200
      const maxWidth = 450

      const clampWidth = (width: number) => Math.max(minWidth, Math.min(maxWidth, width))

      handleElement.setPointerCapture?.(pointerId)

      const handlePointerMove = (e: PointerEvent) => {
        const delta = e.clientX - startX
        const newWidth = clampWidth(startWidth + delta)
        setChangesPanelWidth(newWidth)
      }

      const handlePointerUp = () => {
        if (handleElement.hasPointerCapture?.(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }
        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", handlePointerUp)
      }

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", handlePointerUp, { once: true })
    },
    [changesPanelWidth, setChangesPanelWidth]
  )

  const handleCommitSelect = useCallback((commit: SelectedCommit) => {
    setSelectedCommit(commit)
  }, [setSelectedCommit])

  const handleCommitFileSelect = useCallback((file: { path: string }, _commitHash: string) => {
    handleDiffFileSelect(file, "")
  }, [handleDiffFileSelect])

  const { data: commitFiles } = trpc.changes.getCommitFiles.useQuery(
    {
      worktreePath: worktreePath || "",
      commitHash: selectedCommit?.hash || "",
    },
    {
      enabled: !!worktreePath && !!selectedCommit,
      staleTime: 60000,
    }
  )

  const { data: commitFileDiff } = trpc.changes.getCommitFileDiff.useQuery(
    {
      worktreePath: worktreePath || "",
      commitHash: selectedCommit?.hash || "",
      filePath: selectedFilePath || "",
    },
    {
      enabled: !!worktreePath && !!selectedCommit && !!selectedFilePath,
      staleTime: 60000,
    }
  )

  const shouldUseCommitDiff = activeTab === "history" && selectedCommit
  const effectiveDiff = shouldUseCommitDiff && commitFileDiff ? commitFileDiff : diffContent
  const effectiveParsedFiles = shouldUseCommitDiff ? null : parsedFileDiffs
  const effectivePrefetchedContents = shouldUseCommitDiff ? {} : prefetchedFileContents

  if (isNarrow) {
    const changedFilesCount = diffStatus
      ? (diffStatus.staged?.length || 0) + (diffStatus.unstaged?.length || 0) + (diffStatus.untracked?.length || 0)
      : 0
    const stagedCount = diffStatus?.staged?.length || 0

    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {worktreePath && (
          <div className={cn(
            "flex-shrink-0 overflow-hidden flex flex-col",
            "h-[45%] min-h-[200px] border-b border-border/50"
          )}>
            <ChangesPanel
              worktreePath={worktreePath}
              selectedFilePath={selectedFilePath}
              onFileSelect={handleDiffFileSelect}
              onFileOpenPinned={() => {}}
              onCreatePr={onCreatePr}
              onCommitSuccess={handleCommitSuccess}
              subChats={subChats}
              initialSubChatFilter={filteredSubChatId}
              chatId={aiChatId}
              projectId={projectId}
              diffStateKey={diffStateKey}
              selectedCommitHash={selectedCommit?.hash}
              onCommitSelect={handleCommitSelect}
              onCommitFileSelect={handleCommitFileSelect}
              onActiveTabChange={setActiveTab}
              pushCount={diffStatus?.pushCount}
            />
          </div>
        )}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          <div className={cn(
            "absolute inset-0 overflow-y-auto",
            activeTab === "history" && selectedCommit ? "z-10" : "z-0 invisible"
          )}>
            {selectedCommit && (
              !commitFiles ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading files...</div>
              ) : commitFiles.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No files changed in this commit</div>
              ) : (
                <>
                  <div className="px-3 py-2 border-b border-border/50">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-sm font-medium text-foreground flex-1">
                        {selectedCommit.message}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedCommit.hash)
                          toast.success("Copied SHA to clipboard")
                        }}
                        className="text-xs font-mono text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
                      >
                        {selectedCommit.shortHash}
                      </button>
                    </div>
                    {selectedCommit.description && (
                      <div className="text-xs text-foreground/80 mb-2 whitespace-pre-wrap">
                        {selectedCommit.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : "Unknown date"}
                    </div>
                  </div>

                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                    Files in commit ({commitFiles.length})
                  </div>
                  {commitFiles.map((file) => (
                    <CommitFileItem
                      key={file.path}
                      file={file}
                      onClick={() => {}}
                    />
                  ))}
                </>
              )
            )}
          </div>
          <div className={cn(
            "absolute inset-0 overflow-hidden",
            activeTab === "history" && selectedCommit ? "z-0 invisible" : "z-10"
          )}>
            <AgentDiffView
              ref={diffViewRef}
              chatId={diffStateKey}
              sandboxId={sandboxId}
              worktreePath={worktreePath || undefined}
              repository={repository}
              onStatsChange={setDiffStats}
              initialDiff={effectiveDiff}
              initialParsedFiles={effectiveParsedFiles}
              prefetchedFileContents={effectivePrefetchedContents}
              showFooter={false}
              onCollapsedStateChange={setDiffCollapseState}
              onSelectNextFile={handleSelectNextFile}
              onViewedCountChange={handleViewedCountChange}
              initialSelectedFile={initialSelectedFile}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {worktreePath && (
        <div
          className="h-full flex-shrink-0 relative"
          style={{ width: changesPanelWidth }}
        >
          <ChangesPanel
            worktreePath={worktreePath}
            selectedFilePath={selectedFilePath}
            onFileSelect={handleDiffFileSelect}
            onFileOpenPinned={() => {}}
            onCreatePr={onCreatePr}
            onCommitSuccess={handleCommitSuccess}
            subChats={subChats}
            initialSubChatFilter={filteredSubChatId}
            chatId={aiChatId}
            projectId={projectId}
            diffStateKey={diffStateKey}
            selectedCommitHash={selectedCommit?.hash}
            onCommitSelect={handleCommitSelect}
            onCommitFileSelect={handleCommitFileSelect}
            onActiveTabChange={setActiveTab}
            pushCount={diffStatus?.pushCount}
          />
          <div
            onPointerDown={handleResizePointerDown}
            className="absolute top-0 bottom-0 cursor-col-resize z-10"
            style={{ right: 0, width: "4px", marginRight: "-2px" }}
          />
        </div>
      )}
      <div className={cn(
        "flex-1 h-full min-w-0 overflow-hidden relative",
        "border-l border-border/50"
      )}>
        <div className={cn(
          "absolute inset-0 overflow-y-auto",
          activeTab === "history" && selectedCommit ? "z-10" : "z-0 invisible"
        )}>
          {selectedCommit && (
            !commitFiles ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading files...</div>
            ) : commitFiles.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No files changed in this commit</div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-border/50">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-sm font-medium text-foreground flex-1">
                      {selectedCommit.message}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedCommit.hash)
                        toast.success("Copied SHA to clipboard")
                      }}
                      className="text-xs font-mono text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
                    >
                      {selectedCommit.shortHash}
                    </button>
                  </div>
                  {selectedCommit.description && (
                    <div className="text-xs text-foreground/80 mb-2 whitespace-pre-wrap">
                      {selectedCommit.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : "Unknown date"}
                  </div>
                </div>

                <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                  Files in commit ({commitFiles.length})
                </div>
                {commitFiles.map((file) => (
                  <CommitFileItem
                    key={file.path}
                    file={file}
                    onClick={() => {}}
                  />
                ))}
              </>
            )
          )}
        </div>
        <div className={cn(
          "absolute inset-0 overflow-hidden",
          activeTab === "history" && selectedCommit ? "z-0 invisible" : "z-10"
        )}>
          <AgentDiffView
            ref={diffViewRef}
            chatId={diffStateKey}
            sandboxId={sandboxId}
            worktreePath={worktreePath || undefined}
            repository={repository}
            onStatsChange={setDiffStats}
            initialDiff={effectiveDiff}
            initialParsedFiles={effectiveParsedFiles}
            prefetchedFileContents={effectivePrefetchedContents}
            showFooter={true}
            onCollapsedStateChange={setDiffCollapseState}
            onSelectNextFile={handleSelectNextFile}
            onViewedCountChange={handleViewedCountChange}
            initialSelectedFile={initialSelectedFile}
          />
        </div>
      </div>
    </div>
  )
})
