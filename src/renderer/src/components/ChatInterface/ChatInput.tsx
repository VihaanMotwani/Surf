import { useState, useRef, KeyboardEvent, useEffect } from 'react'
import { Send, Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/store/chat'
import { useIPC } from '@/hooks/useIPC'
import { useRealtime } from '@/hooks/useRealtime'
import { useToast } from '@/components/ui/use-toast'
import { useScreenReaderAnnounce } from '@/hooks/useAccessibility'

export function ChatInput() {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const electron = useIPC()
  const { sessionId, isLoading, addMessage, setLoading } = useChatStore()
  const { toast } = useToast()
  const { announce } = useScreenReaderAnnounce()

  // Realtime voice hook
  const realtime = useRealtime({
    onUserTranscript: (text, order) => {
      // Add user message when transcription is complete
      // Use local sequencing (store handles seq) to prevent jumbling on reconnect
      addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now()
      })
    },
    onAssistantTranscript: (text, order) => {
      // Add assistant message
      // Use local sequencing (store handles seq) to prevent jumbling on reconnect
      addMessage({
        id: `assistant-realtime-${Date.now()}`,
        role: 'assistant',
        content: text,
        timestamp: Date.now()
      })
    },
    onTaskRequested: async (task) => {
      // Handle browser task through existing pipeline
      console.log('[ChatInput] Task requested:', task.taskPrompt)

      // Create task via existing API
      if (sessionId) {
        try {
          // Send a message that will trigger the task pipeline
          // Append [SILENT] marker to suppress end-of-task TTS
          await electron.sendMessage(sessionId, `TASK_PROMPT: ${task.taskPrompt} [SILENT]`, undefined, { silent: true })

          // Send result back to realtime for voice response
          realtime.sendTaskResult(task.callId, `Started browser task: ${task.taskPrompt}`)
        } catch (e) {
          realtime.sendTaskResult(task.callId, 'Failed to start task')
        }
      }
    },
    onError: (message) => {
      toast({
        variant: 'destructive',
        title: 'Realtime Error',
        description: message
      })
    }
  })

  // Auto-connect to realtime when session is available
  useEffect(() => {
    if (sessionId && !realtime.isConnected) {
      realtime.connect(sessionId)
    }
    // Don't disconnect on cleanup - let the WebSocket handle its own lifecycle
    // Disconnecting here causes race conditions with component re-renders
  }, [sessionId, realtime.isConnected, realtime.connect])

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
    try {
      if (realtime.isListening) {
        // Stop listening
        realtime.stopListening()
        announce('Stopped listening.', 'polite')
      } else {
        // Make sure we're connected first
        if (!realtime.isConnected && sessionId) {
          console.log('[ChatInput] Connecting before starting voice...')
          await realtime.connect(sessionId)
          // Wait a moment for connection to establish
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        // Start listening
        console.log('[ChatInput] Starting listening...')
        const started = await realtime.startListening()
        if (started) {
          announce('Listening... speak now.', 'polite')
        }
      }
    } catch (error) {
      console.error('[ChatInput] Voice input error:', error)
      toast({
        variant: 'destructive',
        title: 'Voice Error',
        description: String(error)
      })
    }
  }

  const isDisabled = isLoading || !sessionId
  const isVoiceActive = realtime.isListening || realtime.isSpeaking

  return (
    <div className="border-t bg-background/80 backdrop-blur-sm px-4 py-3">
      <div className="mx-auto max-w-4xl">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              type="text"
              placeholder={
                realtime.isListening
                  ? 'Listening... speak now'
                  : realtime.isSpeaking
                    ? 'Speaking...'
                    : !sessionId
                      ? 'Connecting to server...'
                      : 'Message Surf...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isDisabled || isVoiceActive}
              className="h-11 rounded-xl bg-muted/50 border-border/50 pr-12 focus-visible:bg-background focus-visible:ring-1"
              aria-label="Chat message input"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleVoiceInput}
            disabled={isDisabled && !realtime.isListening}
            className={realtime.isListening
              ? 'h-11 w-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse'
              : 'h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground'
            }
            aria-label={realtime.isListening ? 'Stop listening' : 'Start voice input'}
          >
            {realtime.isListening ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          <Button
            type="submit"
            disabled={!input.trim() || isDisabled}
            className="h-11 w-11 rounded-xl p-0"
            size="icon"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}

