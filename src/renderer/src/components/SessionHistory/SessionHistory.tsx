import { useEffect } from 'react'
import { SessionList } from './SessionList'
import { SessionDetails } from './SessionDetails'
import { useSessionStore } from '@/store/session'
import { useIPC } from '@/hooks/useIPC'
import { Loader2 } from 'lucide-react'

export function SessionHistory() {
  const { selectedSession, setSessions, setLoading, isLoading } = useSessionStore()
  const electron = useIPC()

  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true)
      try {
        const data = await electron.getAllSessions()
        setSessions(data as any)
      } catch (error) {
        console.error('Failed to load sessions:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSessions()
  }, [electron, setSessions, setLoading])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading session history...</span>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <SessionList />
      {selectedSession && <SessionDetails />}
    </div>
  )
}
