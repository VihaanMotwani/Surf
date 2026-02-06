import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/ipc/channels'

// Type definitions for the exposed API
export interface ElectronAPI {
  // Chat methods
  sendMessage: (sessionId: string, message: string, assistantId?: string) => Promise<{ id: string }>
  sendAudio: (sessionId: string, audioBuffer: ArrayBuffer, mimeType: string) => Promise<{ id: string }>
  getChatHistory: () => Promise<unknown[]>
  clearChatHistory: () => Promise<{ success: boolean }>
  onStreamStart: (callback: (messageId: string) => void) => () => void
  onStreamChunk: (callback: (data: { id: string; chunk: string }) => void) => () => void
  onStreamEnd: (callback: (data: { id: string; taskPrompt: string | null; taskId: string | null }) => void) => () => void
  onStreamError: (callback: (error: string) => void) => () => void
  onTranscription: (callback: (data: { text: string }) => void) => () => void

  // Session methods
  createSession: () => Promise<{ id: string; status: string }>

  // Knowledge Graph methods
  getGraphData: () => Promise<unknown>
  updateNode: (nodeId: string, updates: unknown) => Promise<unknown>
  deleteNode: (nodeId: string) => Promise<unknown>
  searchGraph: (query: string) => Promise<unknown>

  // Session browsing methods
  getAllSessions: () => Promise<unknown[]>
  getSessionById: (sessionId: string) => Promise<unknown>
  resumeSession: (sessionId: string) => Promise<unknown>
  deleteSession: (sessionId: string) => Promise<unknown>

  // Speech methods
  synthesizeSpeech: (text: string, options?: unknown) => Promise<unknown>
  stopSpeech: () => Promise<unknown>
  getVoices: () => Promise<unknown>
  startRecognition: () => Promise<unknown>
  stopRecognition: () => Promise<unknown>

  // Settings methods
  getSettings: () => Promise<unknown>
  updateSettings: (updates: unknown) => Promise<unknown>
}

const electronAPI: ElectronAPI = {
  // Chat
  sendMessage: (sessionId: string, message: string, assistantId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_MESSAGE, sessionId, message, assistantId),
  sendAudio: (sessionId: string, audioBuffer: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_AUDIO, sessionId, audioBuffer, mimeType),
  getChatHistory: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_HISTORY),
  clearChatHistory: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_CLEAR_HISTORY),
  onStreamStart: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string) => callback(id)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_START, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_START, listener)
  },
  onStreamChunk: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { id: string; chunk: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_CHUNK, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_CHUNK, listener)
  },
  onStreamEnd: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { id: string; taskPrompt: string | null; taskId: string | null }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_END, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_END, listener)
  },
  onStreamError: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_ERROR, listener)
  },
  onTranscription: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { text: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CHAT_TRANSCRIPTION, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_TRANSCRIPTION, listener)
  },

  // Sessions
  createSession: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE),

  // Knowledge Graph
  getGraphData: () => ipcRenderer.invoke(IPC_CHANNELS.GRAPH_GET_DATA),
  updateNode: (nodeId, updates) => ipcRenderer.invoke(IPC_CHANNELS.GRAPH_UPDATE_NODE, nodeId, updates),
  deleteNode: (nodeId) => ipcRenderer.invoke(IPC_CHANNELS.GRAPH_DELETE_NODE, nodeId),
  searchGraph: (query) => ipcRenderer.invoke(IPC_CHANNELS.GRAPH_SEARCH, query),

  // Session browsing
  getAllSessions: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_ALL),
  getSessionById: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_BY_ID, sessionId),
  resumeSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESUME, sessionId),
  deleteSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, sessionId),

  // Speech
  synthesizeSpeech: (text, options) => ipcRenderer.invoke(IPC_CHANNELS.SPEECH_SYNTHESIZE, text, options),
  stopSpeech: () => ipcRenderer.invoke(IPC_CHANNELS.SPEECH_STOP),
  getVoices: () => ipcRenderer.invoke(IPC_CHANNELS.SPEECH_GET_VOICES),
  startRecognition: () => ipcRenderer.invoke(IPC_CHANNELS.SPEECH_RECOGNIZE_START),
  stopRecognition: () => ipcRenderer.invoke(IPC_CHANNELS.SPEECH_RECOGNIZE_STOP),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (updates) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, updates)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
}
