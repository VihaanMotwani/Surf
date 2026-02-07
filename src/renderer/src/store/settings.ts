import { create } from 'zustand'
import { AppSettings } from '@/lib/types'

interface SettingsState extends AppSettings {
  updateSettings: (updates: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'light',
  textScale: 1,
  reducedMotion: false,
  speechRate: 1.1,  // Slightly faster for more natural flow
  speechPitch: 1,
  speechVolume: 1,
  selectedVoice: 'Samantha',  // Default to Samantha (most natural macOS voice)
  autoSpeak: true,

  updateSettings: (updates) =>
    set((state) => ({
      ...state,
      ...updates
    }))
}))
