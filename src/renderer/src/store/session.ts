import { create } from 'zustand'
import { Session } from '@/lib/types'

interface SessionState {
  sessions: Session[]
  selectedSession: Session | null
  isLoading: boolean
  setSessions: (sessions: Session[]) => void
  setSelectedSession: (session: Session | null) => void
  removeSession: (sessionId: string) => void
  setLoading: (isLoading: boolean) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  selectedSession: null,
  isLoading: false,

  setSessions: (sessions) => set({ sessions }),
  setSelectedSession: (session) => set({ selectedSession: session }),
  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      selectedSession:
        state.selectedSession?.id === sessionId ? null : state.selectedSession
    })),
  setLoading: (isLoading) => set({ isLoading })
}))
