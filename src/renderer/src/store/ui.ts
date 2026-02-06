import { create } from 'zustand'
import { ViewType } from '@/lib/types'

interface UIState {
  currentView: ViewType
  sidebarCollapsed: boolean
  setView: (view: ViewType) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'chat',
  sidebarCollapsed: false,

  setView: (view) => set({ currentView: view }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}))
