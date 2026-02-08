import { useState, useRef, KeyboardEvent, useEffect, type ChangeEvent } from 'react'
import { Send, Mic, Square, Loader2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/store/chat'
import { useSettingsStore } from '@/store/settings'
import { useIPC } from '@/hooks/useIPC'
import { useRealtime } from '@/hooks/useRealtime'
import { useToast } from '@/components/ui/use-toast'
import { useScreenReaderAnnounce } from '@/hooks/useAccessibility'

export function ChatInput() {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const electron = useIPC()
  const { sessionId, isLoading, addMessage, setLoading } = useChatStore()
  const { selectedVoice } = useSettingsStore()
  const { toast } = useToast()
  const { announce } = useScreenReaderAnnounce()

  // Realtime voice hook
  const realtime = useRealtime({
    onUserTranscript: (text, order) => {
      // Use backend order as seq so user message sorts before the assistant reply
      addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        seq: order
      })
    },
    onAssistantTranscript: (text, order) => {
      // Use backend order as seq — always higher than the preceding user message
      addMessage({
        id: `assistant-realtime-${Date.now()}`,
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
        seq: order
      })
    },
    onTextConfirmed: (text, order) => {
      // Add text message with proper order when backend confirms
      addMessage({
        id: `user-text-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        seq: order
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
  // Always call connect when sessionId changes - connect() handles session switching internally
  useEffect(() => {
    if (sessionId) {
      realtime.connect(sessionId, selectedVoice || 'alloy')
    }
    // Don't disconnect on cleanup - let the WebSocket handle its own lifecycle
    // Disconnecting here causes race conditions with component re-renders
  }, [sessionId, selectedVoice, realtime.connect])

  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading || !sessionId) return

    // Message will be added via onTextConfirmed callback with proper order
    setInput('')
    announce('Message sent. Waiting for response.', 'polite')

    // Always call connect to ensure we're connected to the CURRENT session
    // (connect handles session mismatch internally - if connected to wrong session, it reconnects)
    try {
      await realtime.connect(sessionId, selectedVoice || 'alloy')
    } catch (error) {
      console.error('Failed to connect:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to connect to server. Please try again.'
      })
      return
    }

    // Send text through Realtime API (unified pipeline)
    const sent = await realtime.sendTextMessage(trimmedInput)
    if (!sent) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message. Please try again.'
      })
    }

    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFilePick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return

    try {
      const buffer = await file.arrayBuffer()
      const result = await electron.uploadFile(
        sessionId,
        buffer,
        file.type || 'application/octet-stream',
        file.name
      )
      if (!result.success) {
        throw new Error(result.error || 'Upload failed')
      }
      toast({
        title: 'File uploaded',
        description: `${file.name} is ready. You can ask Surf to upload it in a browser task.`
      })
    } catch (error) {
      console.error('File upload failed:', error)
      toast({
        variant: 'destructive',
        title: 'Upload Error',
        description: 'Failed to upload file. Please try again.'
      })
    } finally {
      e.target.value = ''
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
          await realtime.connect(sessionId, selectedVoice || 'alloy')
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
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            aria-hidden="true"
          />
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
            onClick={handleFilePick}
            disabled={!sessionId || isLoading}
            className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground"
            aria-label="Attach file for browser upload"
          >
            <Paperclip className="h-5 w-5" />
          </Button>

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
