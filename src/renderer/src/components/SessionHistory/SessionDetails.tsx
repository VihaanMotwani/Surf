import { X, Play, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useSessionStore } from '@/store/session'
import { useIPC } from '@/hooks/useIPC'
import { useToast } from '@/components/ui/use-toast'
import { formatTimestamp, formatDuration } from '@/lib/utils'

export function SessionDetails() {
  const { selectedSession, setSelectedSession, removeSession } = useSessionStore()
  const electron = useIPC()
  const { toast } = useToast()

  if (!selectedSession) return null

  const handleResume = async () => {
    try {
      const result = await electron.resumeSession(selectedSession.id)
      toast({
        title: 'Session Resume',
        description: (result as any).message || 'Session resumption not yet implemented'
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to resume session'
      })
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this session?')) return

    try {
      await electron.deleteSession(selectedSession.id)
      removeSession(selectedSession.id)
      setSelectedSession(null)
      toast({
        title: 'Session deleted',
        description: 'The session has been removed from history'
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete session'
      })
    }
  }

  return (
    <aside
      className="w-96 bg-background p-6 overflow-y-auto"
      role="complementary"
      aria-label="Session details"
    >
      <div className="flex items-start justify-between mb-6">
        <h3 className="text-xl font-semibold">Session Details</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedSession(null)}
          aria-label="Close session details"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{selectedSession.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedSession.description}
            </p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Date</p>
                <p className="font-medium">
                  {formatTimestamp(selectedSession.timestamp)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Duration</p>
                <p className="font-medium">
                  {formatDuration(selectedSession.duration)}
                </p>
              </div>
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={handleResume}
                className="flex-1"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                size="sm"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div>
          <h4 className="font-medium mb-3">Actions Performed</h4>
          <ol className="space-y-2" aria-label="Session actions">
            {selectedSession.actions.map((action, index) => (
              <li key={index} className="flex items-start space-x-2 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                  {index + 1}
                </span>
                <p className="flex-1 pt-0.5">{action}</p>
              </li>
            ))}
          </ol>
        </div>

        <Separator />

        <div>
          <h4 className="font-medium mb-3">URLs Visited</h4>
          <ul className="space-y-2" aria-label="URLs visited during session">
            {selectedSession.urlsVisited.map((url, index) => (
              <li key={index} className="flex items-start space-x-2 text-sm">
                <ExternalLink className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 hover:underline text-blue-600 dark:text-blue-400 break-all"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  )
}
