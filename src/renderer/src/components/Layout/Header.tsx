import { AccessibilityControls } from '@/components/AccessibilityControls/AccessibilityControls'
import { useUIStore } from '@/store/ui'

export function Header() {
  const { currentView } = useUIStore()

  const titles: Record<string, string> = {
    chat: 'Chat',
    graph: 'Knowledge Graph',
    sessions: 'Sessions'
  }

  return (
    <header
      className="flex h-12 items-center justify-between border-b bg-background px-6"
      role="banner"
    >
      <h2 className="text-sm font-medium text-muted-foreground" id="page-title">
        {titles[currentView] || 'Surf'}
      </h2>

      <div className="flex items-center gap-2">
        <AccessibilityControls />
      </div>
    </header>
  )
}
