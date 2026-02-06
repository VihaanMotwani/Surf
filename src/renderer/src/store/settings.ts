import { create } from 'zustand'
import { AppSettings } from '@/lib/types'

interface SettingsState extends AppSettings {
  updateSettings: (updates: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'light',
  textScale: 1,
  reducedMotion: false,
  speechRate: 1,
  speechPitch: 1,
  speechVolume: 1,
  selectedVoice: null,
  autoSpeak: true,

  updateSettings: (updates) =>
    set((state) => ({
      ...state,
      ...updates
    }))
}))
