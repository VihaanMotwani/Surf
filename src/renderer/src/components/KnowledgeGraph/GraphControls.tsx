import { Network, Table, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useGraphStore } from '@/store/graph'

export function GraphControls() {
  const { viewMode, setViewMode } = useGraphStore()

  return (
    <div className="flex items-center justify-between border-b bg-background px-4 py-3">
      <div className="flex items-center space-x-2" role="toolbar" aria-label="Graph controls">
        <Button
          variant={viewMode === 'graph' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('graph')}
          aria-label="Graph visualization view"
          aria-pressed={viewMode === 'graph'}
        >
          <Network className="h-4 w-4 mr-2" />
          Graph View
        </Button>

        <Button
          variant={viewMode === 'table' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('table')}
          aria-label="Accessible table view"
          aria-pressed={viewMode === 'table'}
        >
          <Table className="h-4 w-4 mr-2" />
          Table View
        </Button>
      </div>

      {viewMode === 'graph' && (
        <>
          <Separator orientation="vertical" className="h-6" />

          <div className="flex items-center space-x-2" role="toolbar" aria-label="Zoom controls">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Fit to screen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
