import { ChatMessage } from '@/lib/types'
import { formatTimestamp } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Volume2, User, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSpeech } from '@/hooks/useSpeech'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { speak, isSpeaking, stop } = useSpeech()
  const isUser = message.role === 'user'

  const handleSpeak = () => {
    if (isSpeaking) {
      stop()
    } else {
      speak(message.content)
    }
  }

  return (
    <div
      className={cn(
        'flex items-start space-x-3',
        isUser && 'flex-row-reverse space-x-reverse'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary' : 'bg-secondary'
        )}
        aria-hidden="true"
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-secondary-foreground" />
        )}
      </div>

      <div className={cn('flex-1 space-y-1', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-lg px-4 py-3 max-w-3xl',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          )}
        >
          <p className="whitespace-pre-wrap break-words">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
            )}
          </p>
        </div>

        <div className={cn('flex items-center space-x-2 px-2', isUser && 'flex-row-reverse space-x-reverse')}>
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(message.timestamp)}
          </span>

          {!isUser && !message.isStreaming && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleSpeak}
              aria-label={isSpeaking ? 'Stop speaking' : 'Read message aloud'}
            >
              <Volume2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
