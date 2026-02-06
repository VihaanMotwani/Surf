import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { apiGet, apiPost, apiDelete } from '../../api'

export function registerSessionHandlers(): void {
  // Create a new session
  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async () => {
    return await apiPost('/sessions', {})
  })

  // List all sessions
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ALL, async () => {
    return await apiGet('/sessions')
  })

  // Get session by ID (with messages)
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_BY_ID, async (_event, sessionId: string) => {
    return await apiGet(`/sessions/${sessionId}?include_messages=true`)
  })

  // Resume session (same as get by ID - loads the session)
  ipcMain.handle(IPC_CHANNELS.SESSION_RESUME, async (_event, sessionId: string) => {
    return await apiGet(`/sessions/${sessionId}?include_messages=true`)
  })

  // Delete session
  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_event, sessionId: string) => {
    return await apiDelete(`/sessions/${sessionId}`)
  })
}
