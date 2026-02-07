import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { apiGet, apiGetStream, apiPostStream, apiPostAudioStream } from '../../api'

function sendToRenderer(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.webContents.send(channel, data)
}

function handleSSE(
  assistantId: string,
  event: { type: string; [key: string]: unknown }
): void {
  if (event.type === 'delta') {
    sendToRenderer(IPC_CHANNELS.CHAT_STREAM_CHUNK, {
      id: assistantId,
      chunk: event.text as string
    })
  } else if (event.type === 'message') {
    // Full message (e.g. confirmation response) — send as single chunk
    sendToRenderer(IPC_CHANNELS.CHAT_STREAM_CHUNK, {
      id: assistantId,
      chunk: event.text as string
    })
  } else if (event.type === 'transcription') {
    sendToRenderer(IPC_CHANNELS.CHAT_TRANSCRIPTION, {
      text: event.text as string
    })
  } else if (event.type === 'done') {
    sendToRenderer(IPC_CHANNELS.CHAT_STREAM_END, {
      id: assistantId,
      taskPrompt: event.task_prompt ?? null,
      taskId: event.task_id ?? null
    })
  } else if (event.type === 'error') {
    sendToRenderer(IPC_CHANNELS.CHAT_STREAM_ERROR, event.message as string)
  }
}

export function registerChatHandlers(): void {
  // Send text message — streams response via SSE events
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_MESSAGE,
    async (_event, sessionId: string, message: string, assistantId?: string) => {
      const id = assistantId || `assistant-${Date.now()}`

      // Only send STREAM_START if the renderer didn't pre-create the placeholder
      if (!assistantId) {
        sendToRenderer(IPC_CHANNELS.CHAT_STREAM_START, id)
      }

      try {
        await apiPostStream(
          `/sessions/${sessionId}/messages/stream`,
          { content: message },
          (sseEvent) => handleSSE(id, sseEvent)
        )
      } catch (err) {
        sendToRenderer(
          IPC_CHANNELS.CHAT_STREAM_ERROR,
          err instanceof Error ? err.message : 'Failed to send message'
        )
      }

      return { id }
    }
  )

  // Send audio message — transcribes + streams response via SSE
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_AUDIO,
    async (_event, sessionId: string, audioBuffer: ArrayBuffer, mimeType: string) => {
      const assistantId = `assistant-${Date.now()}`
      let streamStartSent = false

      try {
        await apiPostAudioStream(
          `/sessions/${sessionId}/messages/audio/stream`,
          Buffer.from(audioBuffer),
          mimeType,
          (sseEvent) => {
            if (sseEvent.type === 'transcription') {
              // Send transcription first (creates user message), then STREAM_START (creates assistant placeholder)
              sendToRenderer(IPC_CHANNELS.CHAT_TRANSCRIPTION, { text: sseEvent.text as string })
              sendToRenderer(IPC_CHANNELS.CHAT_STREAM_START, assistantId)
              streamStartSent = true
            } else {
              // Ensure assistant placeholder exists before sending chunks
              if (!streamStartSent) {
                sendToRenderer(IPC_CHANNELS.CHAT_STREAM_START, assistantId)
                streamStartSent = true
              }
              handleSSE(assistantId, sseEvent)
            }
          }
        )
      } catch (err) {
        sendToRenderer(
          IPC_CHANNELS.CHAT_STREAM_ERROR,
          err instanceof Error ? err.message : 'Failed to process audio'
        )
      }

      return { id: assistantId }
    }
  )

  // Get task status
  ipcMain.handle(IPC_CHANNELS.TASK_GET_STATUS, async (_event, taskId: string) => {
    return apiGet(`/tasks/${taskId}`)
  })

  // Get task events (for result details)
  ipcMain.handle(IPC_CHANNELS.TASK_GET_EVENTS, async (_event, taskId: string) => {
    return apiGet(`/tasks/${taskId}/events`)
  })

  // Stream task events (for real-time progress updates)
  ipcMain.handle(IPC_CHANNELS.TASK_STREAM_EVENTS, async (_event, taskId: string) => {
    try {
      await apiGetStream(
        `/tasks/${taskId}/events/stream`,
        (event) => {
          sendToRenderer(IPC_CHANNELS.TASK_STREAM_EVENT, {
            taskId,
            event
          })
        }
      )
    } catch (err) {
      console.error('Task stream error:', err)
    }
  })

  // Get chat history
  ipcMain.handle(IPC_CHANNELS.CHAT_GET_HISTORY, async () => {
    return []
  })

  // Clear chat history
  ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR_HISTORY, async () => {
    return { success: true }
  })
}
