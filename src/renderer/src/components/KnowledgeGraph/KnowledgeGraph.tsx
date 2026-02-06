import { useEffect } from 'react'
import { GraphVisualization } from './GraphVisualization'
import { GraphControls } from './GraphControls'
import { NodeDetails } from './NodeDetails'
import { AccessibleDataTable } from './AccessibleDataTable'
import { useGraphStore } from '@/store/graph'
import { useIPC } from '@/hooks/useIPC'
import { Loader2 } from 'lucide-react'

export function KnowledgeGraph() {
  const { graphData, viewMode, setGraphData, setLoading, isLoading } = useGraphStore()
  const electron = useIPC()

  useEffect(() => {
    const loadGraphData = async () => {
      setLoading(true)
      try {
        const data = await electron.getGraphData()
        setGraphData(data as any)
      } catch (error) {
        console.error('Failed to load graph data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadGraphData()
  }, [electron, setGraphData, setLoading])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading knowledge graph...</span>
      </div>
    )
  }

  if (!graphData) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No graph data available</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <GraphControls />

      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'graph' ? (
          <div className="flex flex-1">
            <div className="flex-1">
              <GraphVisualization />
            </div>
            <NodeDetails />
          </div>
        ) : (
          <AccessibleDataTable />
        )}
      </div>
    </div>
  )
}
