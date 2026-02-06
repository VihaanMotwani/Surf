import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'

// TODO: Integrate with actual backend memory system
// This is a placeholder implementation with mock graph data

interface GraphNode {
  id: string
  label: string
  type: 'user' | 'preference' | 'website' | 'task' | 'memory'
  x?: number
  y?: number
  size?: number
  color?: string
  metadata?: Record<string, unknown>
}

interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
  type?: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function generateMockGraphData(): GraphData {
  const nodes: GraphNode[] = [
    { id: 'user-1', label: 'User', type: 'user', size: 20, color: '#3b82f6' },
    { id: 'pref-1', label: 'Dark Mode', type: 'preference', size: 10, color: '#8b5cf6' },
    { id: 'pref-2', label: 'Large Text', type: 'preference', size: 10, color: '#8b5cf6' },
    { id: 'pref-3', label: 'Voice Speed: 1.2x', type: 'preference', size: 10, color: '#8b5cf6' },
    { id: 'site-1', label: 'email.google.com', type: 'website', size: 15, color: '#10b981' },
    { id: 'site-2', label: 'weather.com', type: 'website', size: 12, color: '#10b981' },
    { id: 'site-3', label: 'news.ycombinator.com', type: 'website', size: 12, color: '#10b981' },
    { id: 'task-1', label: 'Check Email', type: 'task', size: 12, color: '#f59e0b' },
    { id: 'task-2', label: 'Read News', type: 'task', size: 12, color: '#f59e0b' },
    { id: 'mem-1', label: 'Likes tech news', type: 'memory', size: 10, color: '#ec4899' },
    { id: 'mem-2', label: 'Checks email daily at 9am', type: 'memory', size: 10, color: '#ec4899' }
  ]

  const edges: GraphEdge[] = [
    { id: 'e1', source: 'user-1', target: 'pref-1', label: 'has preference' },
    { id: 'e2', source: 'user-1', target: 'pref-2', label: 'has preference' },
    { id: 'e3', source: 'user-1', target: 'pref-3', label: 'has preference' },
    { id: 'e4', source: 'user-1', target: 'site-1', label: 'visits' },
    { id: 'e5', source: 'user-1', target: 'site-2', label: 'visits' },
    { id: 'e6', source: 'user-1', target: 'site-3', label: 'visits' },
    { id: 'e7', source: 'user-1', target: 'task-1', label: 'performs' },
    { id: 'e8', source: 'user-1', target: 'task-2', label: 'performs' },
    { id: 'e9', source: 'task-1', target: 'site-1', label: 'uses' },
    { id: 'e10', source: 'task-2', target: 'site-3', label: 'uses' },
    { id: 'e11', source: 'user-1', target: 'mem-1', label: 'remembered' },
    { id: 'e12', source: 'user-1', target: 'mem-2', label: 'remembered' }
  ]

  return { nodes, edges }
}

export function registerKnowledgeGraphHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GRAPH_GET_DATA, async () => {
    // Simulate some delay
    await new Promise((resolve) => setTimeout(resolve, 500))
    return generateMockGraphData()
  })

  ipcMain.handle(IPC_CHANNELS.GRAPH_UPDATE_NODE, async (_event, nodeId: string, updates: Partial<GraphNode>) => {
    // TODO: Update node in actual backend
    return { success: true, nodeId, updates }
  })

  ipcMain.handle(IPC_CHANNELS.GRAPH_DELETE_NODE, async (_event, nodeId: string) => {
    // TODO: Delete node in actual backend
    return { success: true, nodeId }
  })

  ipcMain.handle(IPC_CHANNELS.GRAPH_SEARCH, async (_event, query: string) => {
    // TODO: Implement actual search
    const graphData = generateMockGraphData()
    const filteredNodes = graphData.nodes.filter((node) =>
      node.label.toLowerCase().includes(query.toLowerCase())
    )
    return { nodes: filteredNodes }
  })
}
