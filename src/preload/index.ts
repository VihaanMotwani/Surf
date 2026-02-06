import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/ipc/channels'

// Type definitions for the exposed API
export interface ElectronAPI {
  // Chat methods
  sendMessage: (message: string) => Promise<{ id: string; message: string }>
  getChatHistory: () => Promise<unknown[]>
  clearChatHistory: () => Promise<{ success: boolean }>
  onStreamStart: (callback: (messageId: string) => void) => () => void
  onStreamChunk: (callback: (data: { id: string; chunk: string }) => void) => () => void
  onStreamEnd: (callback: (messageId: string) => void) => () => void
  onStreamError: (callback: (error: string) => void) => () => void

  // Knowledge Graph methods
  getGraphData: () => Promise<unknown>
  updateNode: (nodeId: string, updates: unknown) => Promise<unknown>
  deleteNode: (nodeId: string) => Promise<unknown>
  searchGraph: (query: string) => Promise<unknown>

  // Session methods
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

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  // Chat
  sendMessage: (message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_MESSAGE, message),
  getChatHistory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET_HISTORY),
  clearChatHistory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CHAT_CLEAR_HISTORY),
  onStreamStart: (callback: (messageId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, messageId: string) => callback(messageId)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_START, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_START, listener)
  },
  onStreamChunk: (callback: (data: { id: string; chunk: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { id: string; chunk: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_CHUNK, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_CHUNK, listener)
  },
  onStreamEnd: (callback: (messageId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, messageId: string) => callback(messageId)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_END, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_END, listener)
  },
  onStreamError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_ERROR, listener)
  },

  // Knowledge Graph
  getGraphData: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GRAPH_GET_DATA),
  updateNode: (nodeId: string, updates: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.GRAPH_UPDATE_NODE, nodeId, updates),
  deleteNode: (nodeId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GRAPH_DELETE_NODE, nodeId),
  searchGraph: (query: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GRAPH_SEARCH, query),

  // Sessions
  getAllSessions: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_ALL),
  getSessionById: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_BY_ID, sessionId),
  resumeSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESUME, sessionId),
  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, sessionId),

  // Speech
  synthesizeSpeech: (text: string, options?: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SPEECH_SYNTHESIZE, text, options),
  stopSpeech: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SPEECH_STOP),
  getVoices: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SPEECH_GET_VOICES),
  startRecognition: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SPEECH_RECOGNIZE_START),
  stopRecognition: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SPEECH_RECOGNIZE_STOP),

  // Settings
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (updates: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, updates)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
}
