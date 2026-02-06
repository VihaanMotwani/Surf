import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'

// TODO: Integrate with actual speech services
// Speech synthesis will primarily use Web Speech API in renderer
// This handler provides fallback and coordination

export function registerSpeechHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SPEECH_SYNTHESIZE, async (_event, text: string, options?: unknown) => {
    // Web Speech API will be used in renderer process
    // This is a fallback/coordination point
    return {
      success: true,
      message: 'Speech synthesis handled in renderer process',
      text,
      options
    }
  })

  ipcMain.handle(IPC_CHANNELS.SPEECH_STOP, async () => {
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SPEECH_GET_VOICES, async () => {
    // Web Speech API voices are accessed in renderer
    return { voices: [] }
  })

  ipcMain.handle(IPC_CHANNELS.SPEECH_RECOGNIZE_START, async () => {
    // TODO: Implement speech-to-text integration
    // Placeholder for now - will show toast in UI
    return {
      success: false,
      error: 'Speech-to-text not yet implemented',
      message: 'This feature will be available in a future update'
    }
  })

  ipcMain.handle(IPC_CHANNELS.SPEECH_RECOGNIZE_STOP, async () => {
    return { success: true }
  })
}
