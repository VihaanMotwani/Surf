import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SessionCard } from './SessionCard'
import { useSessionStore } from '@/store/session'

export function SessionList() {
  const { sessions } = useSessionStore()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col border-r bg-background">
      <div className="p-4 border-b space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Session History</h2>
          <p className="text-sm text-muted-foreground">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} total
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search session history"
          />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-3"
        role="list"
        aria-label="Session history list"
      >
        {filteredSessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-center">
              {searchQuery
                ? `No sessions found matching "${searchQuery}"`
                : 'No sessions yet'}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))
        )}
      </div>
    </div>
  )
}
