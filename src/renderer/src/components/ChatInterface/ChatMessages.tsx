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
          <div className="text-center space-y-6 max-w-lg px-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Welcome to Surf</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your AI-powered web assistant. Ask me to browse the web, find information,
                or complete tasks. Type below or use your voice.
              </p>
            </div>
            <div className="grid gap-2 pt-2">
              {[
                'Search for the latest news on AI',
                'Check the weather forecast',
                'Help me find a recipe for pasta'
              ].map((suggestion) => (
                <div
                  key={suggestion}
                  className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground text-left hover:bg-muted/60 transition-colors cursor-default"
                >
                  "{suggestion}"
                </div>
              ))}
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
