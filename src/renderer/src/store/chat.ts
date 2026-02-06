import { create } from 'zustand'
import { ChatMessage } from '@/lib/types'

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, content: string) => void
  appendToMessage: (id: string, chunk: string) => void
  setStreamingStatus: (id: string, isStreaming: boolean) => void
  clearMessages: () => void
  setLoading: (isLoading: boolean) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,

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

  clearMessages: () => set({ messages: [] }),

  setLoading: (isLoading) => set({ isLoading })
}))
