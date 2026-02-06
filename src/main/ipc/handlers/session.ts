import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { apiPost } from '../../api'

export function registerSessionHandlers(): void {
  // Create a new session
  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async () => {
    return await apiPost('/sessions', {})
  })

  // Placeholder handlers for other session operations
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ALL, async () => {
    return []
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_BY_ID, async (_event, sessionId: string) => {
    return { id: sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_RESUME, async (_event, sessionId: string) => {
    return { success: true, sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_event, sessionId: string) => {
    return { success: true, sessionId }
  })
}
