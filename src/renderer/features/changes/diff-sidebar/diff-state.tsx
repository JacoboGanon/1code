"use client"

import { useAtom, useAtomValue } from "jotai"
import { flushSync } from "react-dom"
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import {
  agentsChangesPanelCollapsedAtom,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  selectedDiffFilePathAtom,
} from "../../agents/atoms"
import type { ParsedDiffFile } from "../../agents/ui/agent-diff-view"

interface DiffStateContextValue {
  selectedFilePath: string | null
  filteredSubChatId: string | null
  viewedCount: number
  handleDiffFileSelect: (file: { path: string }, category: string) => void
  handleSelectNextFile: (filePath: string) => void
  handleCommitSuccess: () => void
  handleCloseDiff: () => void
  handleViewedCountChange: (count: number) => void
  resetActiveTabRef: MutableRefObject<(() => void) | null>
}

const DiffStateContext = createContext<DiffStateContextValue | null>(null)

export function useDiffState() {
  const ctx = useContext(DiffStateContext)
  if (!ctx) throw new Error("useDiffState must be used within DiffStateProvider")
  return ctx
}

interface DiffStateProviderProps {
  isDiffSidebarOpen: boolean
  parsedFileDiffs: ParsedDiffFile[] | null
  isDiffSidebarNarrow: boolean
  setIsDiffSidebarOpen: (open: boolean) => void
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
  setDiffContent: (content: string | null) => void
  setParsedFileDiffs: (files: ParsedDiffFile[] | null) => void
  setPrefetchedFileContents: (contents: Record<string, string>) => void
  fetchDiffStats: () => void
  children: React.ReactNode
}

export const DiffStateProvider = function DiffStateProvider({
  isDiffSidebarOpen,
  parsedFileDiffs,
  isDiffSidebarNarrow,
  setIsDiffSidebarOpen,
  setDiffStats,
  setDiffContent,
  setParsedFileDiffs,
  setPrefetchedFileContents,
  fetchDiffStats,
  children,
}: DiffStateProviderProps) {
  const [viewedCount, setViewedCount] = useState(0)
  const resetActiveTabRef = useRef<(() => void) | null>(null)

  const [selectedFilePath, setSelectedFilePath] = useAtom(selectedDiffFilePathAtom)
  const [, setFilteredDiffFiles] = useAtom(filteredDiffFilesAtom)
  const [filteredSubChatId, setFilteredSubChatId] = useAtom(filteredSubChatIdAtom)
  const isChangesPanelCollapsed = useAtomValue(agentsChangesPanelCollapsedAtom)

  useLayoutEffect(() => {
    if (!isDiffSidebarOpen) {
      setSelectedFilePath(null)
      setFilteredDiffFiles(null)
      return
    }

    let fileToSelect = selectedFilePath
    if (!fileToSelect && parsedFileDiffs && parsedFileDiffs.length > 0) {
      const firstFile = parsedFileDiffs[0]
      fileToSelect = firstFile.newPath !== "/dev/null" ? firstFile.newPath : firstFile.oldPath
      if (fileToSelect && fileToSelect !== "/dev/null") {
        setSelectedFilePath(fileToSelect)
      }
    }

    const shouldShowAllFiles = isDiffSidebarNarrow && isChangesPanelCollapsed

    if (shouldShowAllFiles) {
      setFilteredDiffFiles(null)
    } else if (fileToSelect) {
      setFilteredDiffFiles([fileToSelect])
    } else {
      setFilteredDiffFiles(null)
    }
  }, [
    isDiffSidebarOpen,
    selectedFilePath,
    parsedFileDiffs,
    isDiffSidebarNarrow,
    isChangesPanelCollapsed,
    setFilteredDiffFiles,
    setSelectedFilePath,
  ])

  const handleDiffFileSelect = useCallback(
    (file: { path: string }, _category: string) => {
      setSelectedFilePath(file.path)
      setFilteredDiffFiles([file.path])
    },
    [setSelectedFilePath, setFilteredDiffFiles]
  )

  const handleSelectNextFile = useCallback(
    (filePath: string) => {
      setSelectedFilePath(filePath)
      setFilteredDiffFiles([filePath])
    },
    [setSelectedFilePath, setFilteredDiffFiles]
  )

  const handleCommitSuccess = useCallback(() => {
    setSelectedFilePath(null)
    setFilteredDiffFiles(null)
    setParsedFileDiffs(null)
    setDiffContent(null)
    setPrefetchedFileContents({})
    setDiffStats({
      fileCount: 0,
      additions: 0,
      deletions: 0,
      isLoading: true,
      hasChanges: false,
    })
    setTimeout(() => {
      fetchDiffStats()
    }, 500)
  }, [
    setSelectedFilePath,
    setFilteredDiffFiles,
    setParsedFileDiffs,
    setDiffContent,
    setPrefetchedFileContents,
    setDiffStats,
    fetchDiffStats,
  ])

  const handleCloseDiff = useCallback(() => {
    flushSync(() => {
      resetActiveTabRef.current?.()
    })
    setIsDiffSidebarOpen(false)
    setFilteredSubChatId(null)
  }, [setIsDiffSidebarOpen, setFilteredSubChatId])

  const handleViewedCountChange = useCallback((count: number) => {
    setViewedCount(count)
  }, [])

  const contextValue = useMemo(
    () => ({
      selectedFilePath,
      filteredSubChatId,
      viewedCount,
      handleDiffFileSelect,
      handleSelectNextFile,
      handleCommitSuccess,
      handleCloseDiff,
      handleViewedCountChange,
      resetActiveTabRef,
    }),
    [
      selectedFilePath,
      filteredSubChatId,
      viewedCount,
      handleDiffFileSelect,
      handleSelectNextFile,
      handleCommitSuccess,
      handleCloseDiff,
      handleViewedCountChange,
    ]
  )

  return (
    <DiffStateContext.Provider value={contextValue}>
      {children}
    </DiffStateContext.Provider>
  )
}
