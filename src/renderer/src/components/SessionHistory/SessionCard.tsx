import { MessageSquare } from 'lucide-react'
import { Session } from '@/lib/types'
import { useSessionStore } from '@/store/session'
import { formatDateString, cn } from '@/lib/utils'

interface SessionCardProps {
  session: Session
}

export function SessionCard({ session }: SessionCardProps) {
  const { selectedSession, setSelectedSession } = useSessionStore()
  const isSelected = selectedSession?.id === session.id

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 cursor-pointer transition-all',
        isSelected
          ? 'border-primary/50 bg-primary/5 shadow-sm'
          : 'border-transparent bg-muted/40 hover:bg-muted/70'
      )}
      onClick={() => setSelectedSession(session)}
      role="listitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setSelectedSession(session)
        }
      }}
      aria-label={`Session: ${session.title || 'Untitled'}`}
      aria-pressed={isSelected}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium truncate flex-1">
          {session.title || 'Untitled'}
        </p>
        <span className={cn(
          'text-[0.6875rem] shrink-0 rounded-full px-2 py-0.5 font-medium',
          session.status === 'idle'
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'
        )}>
          {session.status}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
        <span>{formatDateString(session.updated_at)}</span>
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {session.message_count}
        </span>
      </div>
    </div>
  )
}
