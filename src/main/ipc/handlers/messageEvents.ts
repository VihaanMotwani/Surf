import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { apiGetStream } from '../../api'

function sendToRenderer(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.webContents.send(channel, data)
}

// Track active subscriptions by session ID
const activeSubscriptions = new Map<string, AbortController>()

export function registerMessageEventHandlers(): void {
  // Subscribe to message events for a session
  ipcMain.handle(
    IPC_CHANNELS.MESSAGE_EVENTS_SUBSCRIBE,
    async (_event, sessionId: string) => {
      // Clean up any existing subscription for this session
      const existingController = activeSubscriptions.get(sessionId)
      if (existingController) {
        existingController.abort()
        activeSubscriptions.delete(sessionId)
      }

      const controller = new AbortController()
      activeSubscriptions.set(sessionId, controller)

      try {
        await apiGetStream(
          `/sessions/${sessionId}/messages/events`,
          (event) => {
            if (event.type === 'message_created') {
              sendToRenderer(IPC_CHANNELS.MESSAGE_EVENT_CREATED, {
                sessionId,
                message: event
              })
            } else if (event.type === 'audio_ready') {
              sendToRenderer(IPC_CHANNELS.MESSAGE_EVENT_AUDIO_READY, {
                sessionId,
                messageId: event.message_id,
                audioB64: event.audio_b64,
                format: event.format
              })
            }
            // Ignore keepalive events
          },
          controller.signal
        )
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Message events stream error:', err)
        }
      } finally {
        activeSubscriptions.delete(sessionId)
      }

      return { success: true }
    }
  )

  // Unsubscribe from message events
  ipcMain.handle(
    IPC_CHANNELS.MESSAGE_EVENTS_UNSUBSCRIBE,
    async (_event, sessionId: string) => {
      const controller = activeSubscriptions.get(sessionId)
      if (controller) {
        controller.abort()
        activeSubscriptions.delete(sessionId)
      }
      return { success: true }
    }
  )
}
