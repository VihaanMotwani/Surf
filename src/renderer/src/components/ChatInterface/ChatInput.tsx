import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/store/chat'
import { useIPC } from '@/hooks/useIPC'
import { useAudioRecorder } from '@/hooks/useSpeech'
import { useToast } from '@/components/ui/use-toast'
import { useScreenReaderAnnounce } from '@/hooks/useAccessibility'

export function ChatInput() {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const electron = useIPC()
  const { sessionId, isLoading, addMessage, setLoading } = useChatStore()
  const { isRecording, startRecording, stopRecording } = useAudioRecorder()
  const { toast } = useToast()
  const { announce } = useScreenReaderAnnounce()

  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading || !sessionId) return

    const assistantId = `assistant-${Date.now()}`

    // Add user message then assistant placeholder — synchronous, guaranteed order
    addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now()
    })
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    })

    setInput('')
    setLoading(true)
    announce('Message sent. Waiting for response.', 'polite')

    try {
      await electron.sendMessage(sessionId, trimmedInput, assistantId)
    } catch (error) {
      console.error('Failed to send message:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message. Please try again.'
      })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleVoiceInput = async () => {
    if (isRecording) {
      const result = await stopRecording()
      if (!result || !sessionId) return

      setLoading(true)
      announce('Processing voice...', 'polite')

      try {
        // Send audio to backend — it will transcribe via Whisper and stream the response.
        // The transcription event will add the user message via ChatInterface.
        await electron.sendAudio(sessionId, result.buffer, result.mimeType)
      } catch (error) {
        console.error('Failed to process voice:', error)
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to process voice input. Please try again.'
        })
      } finally {
        setLoading(false)
        inputRef.current?.focus()
      }
      return
    }

    const started = await startRecording()
    if (!started) {
      toast({
        variant: 'destructive',
        title: 'Microphone Error',
        description: 'Could not access microphone. Please check permissions.'
      })
    } else {
      announce('Recording started. Click the stop button when done.', 'polite')
    }
  }

  const isDisabled = isLoading || !sessionId

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto max-w-4xl">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-center space-x-2"
        >
          <Input
            ref={inputRef}
            type="text"
            placeholder={
              isRecording
                ? 'Recording... click stop to send'
                : !sessionId
                  ? 'Connecting to server...'
                  : 'Type your message or use voice input...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled || isRecording}
            className="flex-1"
            aria-label="Chat message input"
          />

          <Button
            type="button"
            variant={isRecording ? 'destructive' : 'outline'}
            size="icon"
            onClick={handleVoiceInput}
            disabled={isDisabled && !isRecording}
            aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
          >
            {isRecording ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          <Button
            type="submit"
            disabled={!input.trim() || isDisabled}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>

        <p className="mt-2 text-xs text-center text-muted-foreground">
          Press Enter to send | Click mic to use voice input
        </p>
      </div>
    </div>
  )
}
