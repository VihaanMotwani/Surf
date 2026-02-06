import { useEffect } from 'react'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { useChatStore } from '@/store/chat'
import { useIPC, useStreamingMessages } from '@/hooks/useIPC'
import { useSpeech } from '@/hooks/useSpeech'
import { useSettingsStore } from '@/store/settings'

export function ChatInterface() {
  const electron = useIPC()
  const { messages, addMessage, appendToMessage, setStreamingStatus } = useChatStore()
  const { speak } = useSpeech()
  const settings = useSettingsStore()

  // Set up streaming message listeners
  useStreamingMessages(
    (messageId) => {
      // Stream started
      addMessage({
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      })
    },
    ({ id, chunk }) => {
      // Stream chunk received
      appendToMessage(id, chunk)
    },
    (messageId) => {
      // Stream ended
      setStreamingStatus(messageId, false)

      // Auto-speak if enabled
      if (settings.autoSpeak) {
        const message = messages.find((m) => m.id === messageId)
        if (message) {
          speak(message.content)
        }
      }
    }
  )

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      await electron.getChatHistory()
      // History is already populated from backend placeholder
    }
    loadHistory()
  }, [electron])

  return (
    <div className="flex h-full flex-col">
      <ChatMessages />
      <ChatInput />
    </div>
  )
}
