import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
