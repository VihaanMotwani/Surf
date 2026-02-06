import { MessageSquare, Network, History, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useUIStore } from '@/store/ui'
import { useChatStore } from '@/store/chat'
import { ViewType } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const { currentView, sidebarCollapsed, setView, toggleSidebar } = useUIStore()
  const clearMessages = useChatStore((s) => s.clearMessages)

  const navItems: Array<{
    id: ViewType
    label: string
    icon: React.ComponentType<{ className?: string }>
    ariaLabel: string
  }> = [
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      ariaLabel: 'Navigate to chat interface'
    },
    {
      id: 'graph',
      label: 'Knowledge Graph',
      icon: Network,
      ariaLabel: 'Navigate to knowledge graph'
    },
    {
      id: 'sessions',
      label: 'Session History',
      icon: History,
      ariaLabel: 'Navigate to session history'
    }
  ]

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-muted/30 transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-14 items-center justify-between px-4">
        {!sidebarCollapsed && (
          <span className="text-lg font-semibold tracking-tight">Surf</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="ml-auto h-8 w-8 text-muted-foreground"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Button
          className={cn(
            'w-full justify-start gap-2 rounded-lg',
            sidebarCollapsed && 'justify-center px-2'
          )}
          onClick={() => {
            clearMessages()
            setView('chat')
          }}
          aria-label="Start new chat"
        >
          <Plus className="h-4 w-4" />
          {!sidebarCollapsed && <span>New Chat</span>}
        </Button>
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id

          return (
            <Button
              key={item.id}
              variant="ghost"
              className={cn(
                'w-full justify-start gap-3 rounded-lg font-normal',
                sidebarCollapsed && 'justify-center px-2',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setView(item.id)}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Button>
          )
        })}
      </nav>

      <Separator />

      <div className="p-4">
        <p className={cn(
          'text-[0.6875rem] text-muted-foreground/60',
          sidebarCollapsed && 'sr-only'
        )}>
          Surf v1.0.0
        </p>
      </div>
    </aside>
  )
}
