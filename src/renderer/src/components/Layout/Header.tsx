import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccessibilityControls } from '@/components/AccessibilityControls/AccessibilityControls'
import { useUIStore } from '@/store/ui'

export function Header() {
  const { currentView } = useUIStore()

  const titles: Record<string, string> = {
    chat: 'Chat Interface',
    graph: 'Knowledge Graph',
    sessions: 'Session History'
  }

  return (
    <header
      className="flex h-16 items-center justify-between border-b bg-background px-6"
      role="banner"
    >
      <div>
        <h2 className="text-lg font-semibold" id="page-title">
          {titles[currentView] || 'Surf'}
        </h2>
      </div>

      <div className="flex items-center space-x-4">
        <AccessibilityControls />

        <Button
          variant="ghost"
          size="icon"
          aria-label="Open settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
