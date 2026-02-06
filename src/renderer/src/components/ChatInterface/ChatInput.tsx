import { useState, useRef, KeyboardEvent } from 'react'
import { Send, Mic, MicOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/store/chat'
import { useIPC } from '@/hooks/useIPC'
import { useSpeechRecognition } from '@/hooks/useSpeech'
import { useToast } from '@/components/ui/use-toast'
import { useScreenReaderAnnounce } from '@/hooks/useAccessibility'

export function ChatInput() {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const electron = useIPC()
  const { addMessage, isLoading, setLoading } = useChatStore()
  const { start: startListening, isListening } = useSpeechRecognition()
  const { toast } = useToast()
  const { announce } = useScreenReaderAnnounce()

  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) return

    // Add user message
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: trimmedInput,
      timestamp: Date.now()
    }

    addMessage(userMessage)
    setInput('')
    setLoading(true)
    announce('Message sent. Waiting for response.', 'polite')

    try {
      // Send to backend (will trigger streaming response via IPC)
      await electron.sendMessage(trimmedInput)
      announce('Response received', 'polite')
    } catch (error) {
      console.error('Failed to send message:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message. Please try again.'
      })
      announce('Failed to send message', 'assertive')
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
    if (isListening) {
      // Stop listening (not implemented yet)
      return
    }

    const result = await startListening()
    if (!result.success) {
      toast({
        title: 'Speech-to-text unavailable',
        description: 'This feature will be available in a future update. Please use text input for now.'
      })
    }
  }

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
            placeholder="Type your message or use voice input..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1"
            aria-label="Chat message input"
          />

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleVoiceInput}
            disabled={isLoading}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          >
            {isListening ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>

          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
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
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
