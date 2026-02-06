import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useGraphStore } from '@/store/graph'
import { cn } from '@/lib/utils'

export function NodeDetails() {
  const { selectedNode, setSelectedNode, graphData } = useGraphStore()

  if (!selectedNode) {
    return (
      <aside
        className="w-80 border-l bg-muted/30 p-4"
        aria-label="Node details panel"
      >
        <p className="text-sm text-muted-foreground text-center">
          Select a node to view details
        </p>
      </aside>
    )
  }

  // Find connected edges
  const connectedEdges = graphData?.edges.filter(
    (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id
  ) || []

  const typeColors: Record<string, string> = {
    user: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    preference: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
    website: 'bg-green-500/10 text-green-700 dark:text-green-300',
    task: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    memory: 'bg-pink-500/10 text-pink-700 dark:text-pink-300'
  }

  return (
    <aside
      className="w-80 border-l bg-background p-4 overflow-y-auto"
      aria-label="Node details panel"
      role="complementary"
    >
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold">Node Details</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedNode(null)}
          aria-label="Close node details"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{selectedNode.label}</CardTitle>
            <span
              className={cn(
                'px-2 py-1 text-xs rounded-full font-medium',
                typeColors[selectedNode.type] || 'bg-gray-500/10 text-gray-700'
              )}
            >
              {selectedNode.type}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">ID</h4>
            <p className="text-sm text-muted-foreground font-mono">
              {selectedNode.id}
            </p>
          </div>

          {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Metadata</h4>
                <dl className="space-y-2">
                  {Object.entries(selectedNode.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">{key}</dt>
                      <dd className="text-sm">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          )}

          {connectedEdges.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Connections ({connectedEdges.length})
                </h4>
                <ul className="space-y-2">
                  {connectedEdges.slice(0, 10).map((edge) => {
                    const isSource = edge.source === selectedNode.id
                    const otherNodeId = isSource ? edge.target : edge.source
                    const otherNode = graphData?.nodes.find((n) => n.id === otherNodeId)

                    return (
                      <li
                        key={edge.id}
                        className="text-sm p-2 rounded-md bg-muted"
                      >
                        <span className="text-muted-foreground">
                          {isSource ? '→' : '←'} {edge.label || 'connected to'}
                        </span>
                        <br />
                        <span className="font-medium">
                          {otherNode?.label || otherNodeId}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </aside>
  )
}
