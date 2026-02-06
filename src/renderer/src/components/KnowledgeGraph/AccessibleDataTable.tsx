import { useState } from 'react'
import { useGraphStore } from '@/store/graph'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export function AccessibleDataTable() {
  const { graphData } = useGraphStore()
  const [searchQuery, setSearchQuery] = useState('')

  if (!graphData) return null

  const filteredNodes = graphData.nodes.filter((node) =>
    node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Knowledge Graph Data</h2>
          <p className="text-muted-foreground">
            Accessible table view of your knowledge graph showing all nodes and their relationships
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search knowledge graph nodes"
          />
        </div>

        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-medium" scope="col">
                  Label
                </th>
                <th className="p-4 text-left font-medium" scope="col">
                  Type
                </th>
                <th className="p-4 text-left font-medium" scope="col">
                  Connections
                </th>
                <th className="p-4 text-left font-medium" scope="col">
                  ID
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((node) => {
                const connections = graphData.edges.filter(
                  (edge) => edge.source === node.id || edge.target === node.id
                )

                return (
                  <tr
                    key={node.id}
                    className="border-b hover:bg-muted/50 transition-colors"
                  >
                    <td className="p-4 font-medium">{node.label}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-secondary">
                        {node.type}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {connections.length} connection{connections.length !== 1 ? 's' : ''}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground font-mono">
                      {node.id}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredNodes.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No nodes found matching "{searchQuery}"
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Showing {filteredNodes.length} of {graphData.nodes.length} nodes
        </p>
      </div>
    </div>
  )
}
