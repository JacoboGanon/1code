"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import { Chat, useChat } from "@ai-sdk/react"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import {
  loadingSubChatsAtom,
  clearLoading,
  setLoading,
  subChatModeAtomFamily,
} from "../atoms"
import { clearPaneAtomFamily } from "../atoms/pane-atoms"
import { IPCChatTransport } from "../lib/ipc-chat-transport"
import { useStreamingStatusStore } from "../stores/streaming-status-store"
import { agentChatStore } from "../stores/agent-chat-store"
import { IconSpinner } from "../../../components/ui/icons"
import { AssistantMessageItem } from "./assistant-message-item"
import { AgentUserMessageBubble } from "../ui/agent-user-message-bubble"
import { AgentsSlashCommand, type SlashCommandOption } from "../commands"

interface PaneChatViewProps {
  paneId: string
  subChatId: string
  projectId: string
  projectPath: string
  isFocused: boolean
}

/**
 * Simplified chat view for panes.
 * This is a minimal implementation that shows:
 * - A loading indicator for the messages
 * - A basic input area
 *
 * For the full feature set, the plan is to refactor ChatViewInner
 * to be more composable and reusable across contexts.
 */
export const PaneChatView = memo(function PaneChatView({
  paneId,
  subChatId,
  projectId,
  projectPath,
  isFocused,
}: PaneChatViewProps) {
  // Query sub-chat data first - we need this before rendering the inner component
  const { data: subChatData, isLoading: isLoadingSubChat } = trpc.chats.getSubChatWithProject.useQuery(
    { id: subChatId },
    { enabled: !!subChatId }
  )

  // Show loading spinner until we have the sub-chat data
  if (isLoadingSubChat || !subChatData) {
    return (
      <div className="h-full flex items-center justify-center">
        <IconSpinner className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Render the inner component only when we have valid data
  return (
    <PaneChatViewInner
      paneId={paneId}
      subChatId={subChatId}
      projectId={projectId}
      projectPath={projectPath}
      isFocused={isFocused}
      subChatData={subChatData}
    />
  )
})

interface PaneChatViewInnerProps extends PaneChatViewProps {
  subChatData: NonNullable<ReturnType<typeof trpc.chats.getSubChatWithProject.useQuery>["data"]>
}

/**
 * Inner component that uses the useChat hook.
 * Only rendered when subChatData is available to avoid hook issues.
 */
const PaneChatViewInner = memo(function PaneChatViewInner({
  paneId,
  subChatId,
  projectId,
  projectPath,
  isFocused,
  subChatData,
}: PaneChatViewInnerProps) {
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)

  // Slash command state
  const [showSlashDropdown, setShowSlashDropdown] = useState(false)
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 })

  const setLoadingSubChats = useSetAtom(loadingSubChatsAtom)

  // Per-subChat mode
  const subChatModeAtom = useMemo(
    () => subChatModeAtomFamily(subChatId),
    [subChatId]
  )
  const [subChatMode, setSubChatMode] = useAtom(subChatModeAtom)

  // Clear pane action (for /clear command)
  const clearPane = useSetAtom(clearPaneAtomFamily(projectId))

  // Get streaming status
  const isStreaming = useStreamingStatusStore((state) => state.isStreaming(subChatId))

  // Parse initial messages from sub-chat data
  const initialMessages = useMemo(() => {
    if (!subChatData?.messages) return []
    try {
      return JSON.parse(subChatData.messages)
    } catch {
      return []
    }
  }, [subChatData?.messages])

  // Create or get Chat instance for this sub-chat
  const chat = useMemo(() => {
    // Check if we already have a chat instance
    const existing = agentChatStore.get(subChatId)
    if (existing) {
      return existing
    }

    // Create transport
    const transport = new IPCChatTransport({
      chatId: projectId,
      subChatId,
      cwd: projectPath,
      projectPath: projectPath,
      mode: subChatMode,
    })

    // Create new Chat instance
    const newChat = new Chat<any>({
      id: subChatId,
      messages: initialMessages,
      transport,
      onError: () => {
        useStreamingStatusStore.getState().setStatus(subChatId, "ready")
      },
      onFinish: () => {
        clearLoading(setLoadingSubChats, subChatId)
        useStreamingStatusStore.getState().setStatus(subChatId, "ready")
      },
    })

    // Store for later retrieval (use projectId as parent chat ID for pane-based chats)
    agentChatStore.set(subChatId, newChat, projectId)

    return newChat
  }, [subChatId, projectId, subChatMode, projectPath, initialMessages, setLoadingSubChats])

  // Use the chat hook with the Chat instance
  const { messages, sendMessage, status } = useChat({
    id: subChatId,
    chat,
  })

  // Focus input when pane is focused
  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isFocused])

  // Calculate slash command dropdown position
  const updateSlashPosition = useCallback(() => {
    if (inputContainerRef.current) {
      const rect = inputContainerRef.current.getBoundingClientRect()
      setSlashPosition({
        top: rect.top,
        left: rect.left,
      })
    }
  }, [])

  // Handle input change - detect slash commands
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    // Show slash dropdown when input starts with "/" and has no space yet
    if (value.startsWith("/") && !value.includes(" ")) {
      updateSlashPosition()
      setShowSlashDropdown(true)
    } else {
      setShowSlashDropdown(false)
    }
  }, [updateSlashPosition])

  // Handle slash command selection
  const handleSlashSelect = useCallback((command: SlashCommandOption) => {
    setShowSlashDropdown(false)
    setInputValue("")

    // Handle builtin commands
    if (command.category === "builtin") {
      switch (command.name) {
        case "clear":
          // Clear pane (creates opportunity for new sub-chat)
          clearPane(paneId)
          return
        case "plan":
          if (subChatMode !== "plan") {
            setSubChatMode("plan")
          }
          return
        case "agent":
          if (subChatMode === "plan") {
            setSubChatMode("agent")
          }
          return
        case "compact":
          // Send /compact message to trigger context compaction
          if (!isStreaming && sendMessage) {
            setLoading(setLoadingSubChats, subChatId, projectId)
            useStreamingStatusStore.getState().setStatus(subChatId, "streaming")
            sendMessage({
              role: "user",
              parts: [{ type: "text", text: "/compact" }],
            })
          }
          return
      }
    }

    // For other commands, insert into input
    setInputValue(`/${command.name} `)
  }, [clearPane, paneId, subChatMode, setSubChatMode, isStreaming, sendMessage, setLoadingSubChats, subChatId, projectId])

  // Close slash dropdown
  const handleCloseSlashDropdown = useCallback(() => {
    setShowSlashDropdown(false)
  }, [])

  // Handle submit
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isStreaming || !sendMessage) return

    setLoading(setLoadingSubChats, subChatId, projectId)
    useStreamingStatusStore.getState().setStatus(subChatId, "streaming")

    try {
      await sendMessage({
        role: "user",
        parts: [{ type: "text", text: inputValue.trim() }],
      })
    } catch (error) {
      console.error("[PaneChatView] Send error:", error)
      clearLoading(setLoadingSubChats, subChatId)
      useStreamingStatusStore.getState().setStatus(subChatId, "ready")
    }

    setInputValue("")
  }, [inputValue, isStreaming, sendMessage, setLoadingSubChats, subChatId, projectId])

  return (
    <div className={cn(
      "h-full flex flex-col",
      !isFocused && "opacity-90"
    )}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Start a conversation...
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isLast = index === messages.length - 1

            if (message.role === "user") {
              // Extract text and image parts for user message
              const textContent = message.parts
                ?.filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("\n") || ""
              const imageParts = message.parts?.filter((p: any) => p.type === "data-image") || []

              return (
                <div key={message.id || index} className="mb-4">
                  <AgentUserMessageBubble
                    messageId={message.id}
                    textContent={textContent}
                    imageParts={imageParts}
                  />
                </div>
              )
            }

            if (message.role === "assistant") {
              return (
                <AssistantMessageItem
                  key={message.id || index}
                  message={message}
                  isLastMessage={isLast}
                  isStreaming={status === "streaming" || status === "submitted"}
                  status={status}
                  isMobile={false}
                  subChatId={subChatId}
                  chatId={projectId}
                />
              )
            }

            return null
          })
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t p-3">
        <div ref={inputContainerRef} className="flex items-center gap-2 relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Type a message... (/ for commands)"
            disabled={isStreaming}
            className={cn(
              "flex-1 bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "placeholder:text-muted-foreground",
              isStreaming && "opacity-50 cursor-not-allowed"
            )}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isStreaming}
            className={cn(
              "px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium",
              "hover:bg-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            Send
          </button>

          {/* Slash command dropdown */}
          <AgentsSlashCommand
            isOpen={showSlashDropdown}
            onClose={handleCloseSlashDropdown}
            onSelect={handleSlashSelect}
            searchText={inputValue.slice(1)} // Remove leading /
            position={slashPosition}
            projectPath={projectPath}
            mode={subChatMode}
          />
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setSubChatMode(subChatMode === "agent" ? "plan" : "agent")}
            className="hover:text-foreground transition-colors"
          >
            Mode: {subChatMode}
          </button>
        </div>
      </form>
    </div>
  )
})
