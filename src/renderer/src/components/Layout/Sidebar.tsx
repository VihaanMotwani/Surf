import { MessageSquare, Network, History, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useUIStore } from '@/store/ui'
import { ViewType } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const { currentView, sidebarCollapsed, setView, toggleSidebar } = useUIStore()

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
        'flex h-full flex-col border-r bg-background transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!sidebarCollapsed && (
          <h1 className="text-xl font-bold">Surf</h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="ml-auto"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      <Separator />

      <nav className="flex-1 space-y-2 p-4" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id

          return (
            <Button
              key={item.id}
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start',
                sidebarCollapsed && 'justify-center px-2'
              )}
              onClick={() => setView(item.id)}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5', !sidebarCollapsed && 'mr-3')} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Button>
          )
        })}
      </nav>

      <Separator />

      <div className="p-4">
        <p className={cn(
          'text-xs text-muted-foreground',
          sidebarCollapsed && 'sr-only'
        )}>
          Surf v1.0.0
        </p>
      </div>
    </aside>
  )
}
