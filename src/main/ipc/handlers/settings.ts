import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'

// TODO: Persist settings to file system
// This is a placeholder implementation with in-memory storage

interface AppSettings {
  theme: 'light' | 'dark' | 'high-contrast'
  textScale: number
  reducedMotion: boolean
  speechRate: number
  speechPitch: number
  speechVolume: number
  selectedVoice: string | null
  autoSpeak: boolean
}

let settings: AppSettings = {
  theme: 'light',
  textScale: 1,
  reducedMotion: false,
  speechRate: 1,
  speechPitch: 1,
  speechVolume: 1,
  selectedVoice: null,
  autoSpeak: true
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    return settings
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_event, updates: Partial<AppSettings>) => {
    settings = { ...settings, ...updates }
    // TODO: Persist to file system
    return { success: true, settings }
  })
}
