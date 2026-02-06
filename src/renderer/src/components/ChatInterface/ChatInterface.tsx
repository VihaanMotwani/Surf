import { useEffect, useRef } from 'react'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { useChatStore } from '@/store/chat'
import { useIPC } from '@/hooks/useIPC'
import { useSpeech } from '@/hooks/useSpeech'
import { useSettingsStore } from '@/store/settings'
import { useToast } from '@/components/ui/use-toast'

export function ChatInterface() {
  const electron = useIPC()
  const { sessionId, addMessage, appendToMessage, setStreamingStatus, setSessionId, setLoading } =
    useChatStore()
  const { speak } = useSpeech()
  const settings = useSettingsStore()
  const { toast } = useToast()
  const sessionCreatingRef = useRef(false)
  const messagesRef = useRef(useChatStore.getState().messages)

  // Keep ref in sync with store
  useEffect(() => {
    return useChatStore.subscribe((state) => {
      messagesRef.current = state.messages
    })
  }, [])

  // Create a backend session on mount
  useEffect(() => {
    const ensureSession = async () => {
      if (sessionId || sessionCreatingRef.current) return
      sessionCreatingRef.current = true
      try {
        const session = await electron.createSession()
        setSessionId(session.id)
      } catch {
        toast({
          variant: 'destructive',
          title: 'Connection Error',
          description: 'Could not connect to the backend. Make sure the server is running.'
        })
      } finally {
        sessionCreatingRef.current = false
      }
    }
    ensureSession()
  }, [sessionId, electron, setSessionId, toast])

  // Set up streaming + transcription listeners
  useEffect(() => {
    const unsubStart = electron.onStreamStart((messageId) => {
      addMessage({
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      })
    })

    const unsubChunk = electron.onStreamChunk(({ id, chunk }) => {
      appendToMessage(id, chunk)
    })

    const unsubEnd = electron.onStreamEnd((data) => {
      setStreamingStatus(data.id, false)
      setLoading(false)

      // Auto-speak if enabled
      if (settings.autoSpeak) {
        const message = messagesRef.current.find((m) => m.id === data.id)
        if (message) speak(message.content)
      }
    })

    const unsubError = electron.onStreamError((error) => {
      console.error('[stream] error:', error)
      setLoading(false)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error || 'Failed to get response.'
      })
    })

    // When audio is transcribed, show the user message
    const unsubTranscription = electron.onTranscription((data) => {
      addMessage({
        id: `user-voice-${Date.now()}`,
        role: 'user',
        content: data.text,
        timestamp: Date.now()
      })
    })

    return () => {
      unsubStart()
      unsubChunk()
      unsubEnd()
      unsubError()
      unsubTranscription()
    }
  }, [electron, addMessage, appendToMessage, setStreamingStatus, setLoading, speak, settings.autoSpeak, toast])

  return (
    <div className="flex h-full flex-col">
      <ChatMessages />
      <ChatInput />
    </div>
  )
}
