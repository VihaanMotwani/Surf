import { CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Session } from '@/lib/types'
import { useSessionStore } from '@/store/session'
import { formatTimestamp, formatDuration, cn } from '@/lib/utils'

interface SessionCardProps {
  session: Session
}

export function SessionCard({ session }: SessionCardProps) {
  const { selectedSession, setSelectedSession } = useSessionStore()
  const isSelected = selectedSession?.id === session.id

  const getOutcomeIcon = () => {
    switch (session.outcome) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'partial':
        return <AlertCircle className="h-4 w-4 text-amber-600" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getOutcomeLabel = () => {
    switch (session.outcome) {
      case 'success':
        return 'Success'
      case 'partial':
        return 'Incomplete'
      case 'failed':
        return 'Failed'
    }
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent',
        isSelected && 'border-primary bg-accent'
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
      aria-label={`Session: ${session.title}`}
      aria-pressed={isSelected}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base line-clamp-1">
            {session.title}
          </CardTitle>
          <div className="flex items-center space-x-1" aria-label={`Outcome: ${getOutcomeLabel()}`}>
            {getOutcomeIcon()}
          </div>
        </div>

        <CardDescription className="line-clamp-2">
          {session.description}
        </CardDescription>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatTimestamp(session.timestamp)}</span>
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(session.duration)}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="rounded-full bg-secondary px-2 py-1">
            {session.actions.length} actions
          </span>
          <span className="rounded-full bg-secondary px-2 py-1">
            {session.urlsVisited.length} URLs
          </span>
        </div>
      </CardHeader>
    </Card>
  )
}
