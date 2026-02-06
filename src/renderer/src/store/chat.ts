import { create } from 'zustand'
import { ChatMessage } from '@/lib/types'

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  sessionId: string | null
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

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

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

  clearMessages: () => set({ messages: [], sessionId: null }),

  setLoading: (isLoading) => set({ isLoading }),
  setSessionId: (sessionId) => set({ sessionId }),

  loadSession: (sessionId, messages) =>
    set({
      sessionId,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
        isStreaming: false
      }))
    })
}))
