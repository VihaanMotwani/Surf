import { useEffect, useRef } from 'react'
import { useChatStore } from '@/store/chat'
import { MessageBubble } from './MessageBubble'

export function ChatMessages() {
  const { messages } = useChatStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-6"
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-2xl font-bold">Welcome to Surf</h2>
            <p className="text-muted-foreground">
              I'm your speech-driven web assistant. Ask me to search the web, check your email,
              read news, or help you with any browsing tasks. You can type or use voice commands.
            </p>
            <div className="mt-6 space-y-2 text-left">
              <p className="text-sm font-medium">Try asking:</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• "Search for the latest news on AI"</li>
                <li>• "Check the weather forecast"</li>
                <li>• "Help me find a recipe for pasta"</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  )
}
