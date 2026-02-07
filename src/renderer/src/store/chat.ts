import { create } from 'zustand'
import { ChatMessage } from '@/lib/types'

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  sessionId: string | null
  messageSeq: number  // Monotonically increasing sequence for ordering
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, content: string) => void
  appendToMessage: (id: string, chunk: string) => void
  setStreamingStatus: (id: string, isStreaming: boolean) => void
  setTaskInfo: (
    messageId: string,
    taskId: string,
    status: 'running' | 'succeeded' | 'failed',
    result?: Record<string, unknown>
  ) => void
  addTaskStep: (messageId: string, step: Record<string, unknown>) => void
  setAudioPlayed: (messageId: string) => void
  clearMessages: () => void
  setLoading: (isLoading: boolean) => void
  setSessionId: (id: string | null) => void
  loadSession: (
    sessionId: string,
    messages: Array<{ id: string; role: string; content: string; created_at?: string }>
  ) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  sessionId: null,
  messageSeq: 0,

  addMessage: (message) =>
    set((state) => {
      // Check for existing message with same ID
      const existingIndex = state.messages.findIndex((m) => m.id === message.id)

      if (existingIndex !== -1) {
        // Update existing message
        const updatedMessages = [...state.messages]
        updatedMessages[existingIndex] = { ...updatedMessages[existingIndex], ...message }
        return { messages: updatedMessages }
      }

      // Add new message
      // Use provided seq (from backend order) or auto-assign from counter
      const newSeq = message.seq ?? (state.messageSeq + 1)
      return {
        messageSeq: Math.max(state.messageSeq + 1, newSeq),
        messages: [...state.messages, { ...message, seq: newSeq }]
      }
    }),

  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content } : msg
      )
    })),

  appendToMessage: (id, chunk) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content: msg.content + chunk } : msg
      )
    })),

  setStreamingStatus: (id, isStreaming) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, isStreaming } : msg
      )
    })),

  setTaskInfo: (messageId, taskId, status, result) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, taskId, taskStatus: status, taskResult: result } : msg
      )
    })),

  addTaskStep: (messageId, step) =>
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg
        const steps = (msg.taskSteps || []) as Record<string, unknown>[]
        return { ...msg, taskSteps: [...steps, step] }
      })
    })),

  setAudioPlayed: (messageId) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, audioPlayed: true } : msg
      )
    })),

  clearMessages: () => set({ messages: [], sessionId: null, messageSeq: 0 }),

  setLoading: (isLoading) => set({ isLoading }),
  setSessionId: (sessionId) => set({ sessionId }),

  loadSession: (sessionId, messages) =>
    set({
      sessionId,
      messageSeq: messages.length,  // Set seq to count of loaded messages
      messages: messages.map((m, index) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
        seq: index + 1,  // Assign seq based on load order
        isStreaming: false
      }))
    })
}))
