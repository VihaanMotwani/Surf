import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test case
afterEach(() => {
  cleanup()
})

// Mock window.electron for tests
global.window.electron = {
  sendMessage: async () => ({ id: '1', message: 'test' }),
  getChatHistory: async () => [],
  clearChatHistory: async () => ({ success: true }),
  onStreamStart: () => () => {},
  onStreamChunk: () => () => {},
  onStreamEnd: () => () => {},
  onStreamError: () => () => {},
  getGraphData: async () => ({ nodes: [], edges: [] }),
  updateNode: async () => ({ success: true }),
  deleteNode: async () => ({ success: true }),
  searchGraph: async () => ({ nodes: [] }),
  getAllSessions: async () => [],
  getSessionById: async () => null,
  resumeSession: async () => ({ success: true }),
  deleteSession: async () => ({ success: true }),
  synthesizeSpeech: async () => ({ success: true }),
  stopSpeech: async () => ({ success: true }),
  getVoices: async () => ({ voices: [] }),
  startRecognition: async () => ({ success: false }),
  stopRecognition: async () => ({ success: true }),
  getSettings: async () => ({
    theme: 'light',
    textScale: 1,
    reducedMotion: false,
    speechRate: 1,
    speechPitch: 1,
    speechVolume: 1,
    selectedVoice: null,
    autoSpeak: true
  }),
  updateSettings: async () => ({ success: true })
} as any

// Mock Web Speech API
global.window.speechSynthesis = {
  speak: () => {},
  cancel: () => {},
  pause: () => {},
  resume: () => {},
  getVoices: () => [],
  onvoiceschanged: null
} as any
