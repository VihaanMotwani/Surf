import { ChatMessage } from '@/lib/types'
import { formatTimestamp } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Volume2, User, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSpeech } from '@/hooks/useSpeech'
import { TaskStatusCard } from './TaskStatusCard'

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
        'group flex items-start gap-3',
        isUser && 'flex-row-reverse'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground'
        )}
        aria-hidden="true"
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      <div className={cn('flex-1 space-y-1.5 min-w-0', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'inline-block max-w-[85%] rounded-2xl px-4 py-2.5',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-md'
              : 'bg-muted text-foreground rounded-tl-md'
          )}
        >
          <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">
            {message.content}
            {message.isStreaming && (
              <span className="inline-flex ml-1 gap-0.5 align-middle">
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
              </span>
            )}
          </p>
        </div>

        <div className={cn(
          'flex items-center gap-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity',
          isUser && 'flex-row-reverse'
        )}>
          <span className="text-[0.6875rem] text-muted-foreground">
            {formatTimestamp(message.timestamp)}
          </span>

          {!isUser && !message.isStreaming && message.content && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={handleSpeak}
              aria-label={isSpeaking ? 'Stop speaking' : 'Read message aloud'}
            >
              <Volume2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        {message.taskId && message.taskStatus && (
          <TaskStatusCard taskStatus={message.taskStatus} taskResult={message.taskResult} />
        )}
      </div>
    </div>
  )
}
