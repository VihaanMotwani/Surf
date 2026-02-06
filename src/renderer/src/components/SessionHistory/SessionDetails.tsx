import { X, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useSessionStore } from '@/store/session'
import { useChatStore } from '@/store/chat'
import { useUIStore } from '@/store/ui'
import { useIPC } from '@/hooks/useIPC'
import { useToast } from '@/components/ui/use-toast'
import { formatDateString } from '@/lib/utils'

export function SessionDetails() {
  const { selectedSession, setSelectedSession, removeSession } = useSessionStore()
  const loadSession = useChatStore((s) => s.loadSession)
  const setView = useUIStore((s) => s.setView)
  const electron = useIPC()
  const { toast } = useToast()

  if (!selectedSession) return null

  const handleResume = async () => {
    try {
      const fullSession = (await electron.getSessionById(selectedSession.id)) as {
        id: string
        messages: Array<{ id: string; role: string; content: string; created_at?: string }>
      }
      loadSession(fullSession.id, fullSession.messages)
      setView('chat')
    } catch {
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
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete session'
      })
    }
  }

  return (
    <aside
      className="w-80 border-l bg-background p-5 overflow-y-auto"
      role="complementary"
      aria-label="Session details"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-muted-foreground">Details</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => setSelectedSession(null)}
          aria-label="Close session details"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-5">
        <div>
          <h4 className="text-base font-semibold leading-tight">
            {selectedSession.title || 'Untitled'}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {selectedSession.status}
          </p>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Created</p>
            <p className="font-medium text-sm">
              {formatDateString(selectedSession.created_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Last active</p>
            <p className="font-medium text-sm">
              {formatDateString(selectedSession.updated_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Messages</p>
            <p className="font-medium text-sm">{selectedSession.message_count}</p>
          </div>
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button
            onClick={handleResume}
            className="flex-1 rounded-lg"
            size="sm"
          >
            <Play className="h-3.5 w-3.5 mr-2" />
            Resume
          </Button>
          <Button
            variant="ghost"
            onClick={handleDelete}
            size="sm"
            className="rounded-lg text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
