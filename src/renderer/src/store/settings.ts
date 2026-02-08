import { create } from 'zustand'
import { AppSettings } from '@/lib/types'

interface SettingsState extends AppSettings {
  updateSettings: (updates: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'light',
  textScale: 1,
  reducedMotion: false,
  speechSpeed: 1.0,  // OpenAI TTS speed (0.25 to 4.0, default 1.0)
  selectedVoice: 'alloy',  // Default OpenAI Realtime API voice
  ttsModel: 'tts-1',  // Use faster model by default
  autoSpeak: true,

  updateSettings: (updates) =>
    set((state) => ({
      ...state,
      ...updates
    }))
}))
