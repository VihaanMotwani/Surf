import { useEffect, useRef } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { useGraphStore } from '@/store/graph'
import { useSettingsStore } from '@/store/settings'
import forceAtlas2 from 'graphology-layout-forceatlas2'

export function GraphVisualization() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const { graphData, setSelectedNode, selectedNode } = useGraphStore()
  const { theme } = useSettingsStore()

  useEffect(() => {
    if (!containerRef.current || !graphData) return

    // Clear previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill()
      sigmaRef.current = null
    }

    // Create graph
    const graph = new Graph() as any

    // Count connections per node
    const connectionCount: Record<string, number> = {}
    graphData.edges.forEach((edge) => {
      connectionCount[edge.source] = (connectionCount[edge.source] || 0) + 1
      connectionCount[edge.target] = (connectionCount[edge.target] || 0) + 1
    })

    // Add nodes with size based on connections
    graphData.nodes.forEach((node, index) => {
      const angle = (index / graphData.nodes.length) * 2 * Math.PI
      const radius = 100
      const connections = connectionCount[node.id] || 1
      // Scale node size: min 8, max 30 based on connections
      const nodeSize = Math.min(30, Math.max(8, 8 + connections * 2))

      graph.addNode(node.id, {
        label: node.label,
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        size: nodeSize,
        color: node.color || (theme === 'dark' ? '#888' : '#666'),
      })
    })

    // Add edges (no labels for cleaner look)
    graphData.edges.forEach((edge) => {
      try {
        if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
          graph.addEdge(edge.source, edge.target, {
            size: 2,
            color: theme === 'dark' ? 'rgba(150,150,150,0.7)' : 'rgba(100,100,100,0.6)'
          })
        }
      } catch (error) {
        // Edge may already exist (duplicate)
      }
    })

    // Apply ForceAtlas2 layout - clusters connected nodes together
    const settings = forceAtlas2.inferSettings(graph)
    forceAtlas2.assign(graph, {
      settings: {
        ...settings,
        gravity: 0.5,
        scalingRatio: 2,
        slowDown: 5,
      },
      iterations: 100
    })

    // Initialize Sigma with cleaner settings
    try {
      const sigma = new Sigma(graph, containerRef.current, {
        renderEdgeLabels: false, // Hide edge labels for cleaner look
        defaultNodeColor: theme === 'dark' ? '#888' : '#666',
        defaultEdgeColor: theme === 'dark' ? 'rgba(150,150,150,0.7)' : 'rgba(100,100,100,0.6)',
        labelFont: 'Inter, system-ui, sans-serif',
        labelSize: 12,
        labelWeight: '500',
        labelColor: { color: theme === 'dark' ? '#ddd' : '#333' },
        labelRenderedSizeThreshold: 10, // Only show labels for larger nodes
        zIndex: true,
        minCameraRatio: 0.1,
        maxCameraRatio: 10,
      })

      sigmaRef.current = sigma

      // Handle node clicks
      sigma.on('clickNode', ({ node }) => {
        const nodeData = graphData.nodes.find((n) => n.id === node)
        if (nodeData) {
          setSelectedNode(nodeData)
          // Highlight selected node
          graph.setNodeAttribute(node, 'highlighted', true)
          sigma.refresh()
        }
      })

      // Handle node hover - show label and highlight connections
      sigma.on('enterNode', ({ node }) => {
        containerRef.current!.style.cursor = 'pointer'

        // Highlight this node and its neighbors
        graph.forEachNode((n: string) => {
          if (n === node || graph.hasEdge(node, n) || graph.hasEdge(n, node)) {
            graph.setNodeAttribute(n, 'highlighted', true)
          } else {
            graph.setNodeAttribute(n, 'hidden', true)
          }
        })
        graph.forEachEdge((e: string) => {
          const [source, target] = graph.extremities(e)
          if (source !== node && target !== node) {
            graph.setEdgeAttribute(e, 'hidden', true)
          }
        })
        sigma.refresh()
      })

      sigma.on('leaveNode', () => {
        containerRef.current!.style.cursor = 'default'
        // Reset all nodes
        graph.forEachNode((n: string) => {
          graph.removeNodeAttribute(n, 'highlighted')
          graph.removeNodeAttribute(n, 'hidden')
        })
        graph.forEachEdge((e: string) => {
          graph.removeEdgeAttribute(e, 'hidden')
        })
        sigma.refresh()
      })

      // Fit graph to view
      sigma.getCamera().animatedReset({ duration: 500 })

    } catch (error) {
      console.error('Failed to initialize Sigma:', error)
    }

    // Cleanup
    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill()
        sigmaRef.current = null
      }
    }
  }, [graphData, setSelectedNode, theme])

  // Highlight selected node when it changes
  useEffect(() => {
    if (!sigmaRef.current || !graphData) return

    const graph = sigmaRef.current.getGraph() as any

    // Count connections for sizing
    const connectionCount: Record<string, number> = {}
    graphData.edges.forEach((edge) => {
      connectionCount[edge.source] = (connectionCount[edge.source] || 0) + 1
      connectionCount[edge.target] = (connectionCount[edge.target] || 0) + 1
    })

    // Reset all node sizes
    graph.forEachNode((node: string) => {
      const connections = connectionCount[node] || 1
      const baseSize = Math.min(30, Math.max(8, 8 + connections * 2))
      graph.setNodeAttribute(node, 'size', baseSize)
    })

    // Highlight selected node
    if (selectedNode) {
      if (graph.hasNode(selectedNode.id)) {
        graph.setNodeAttribute(selectedNode.id, 'size', 35)

        // Center camera on selected node
        const nodeDisplayData = sigmaRef.current.getNodeDisplayData(selectedNode.id)
        if (nodeDisplayData) {
          const camera = sigmaRef.current.getCamera()
          camera.animate({ x: nodeDisplayData.x, y: nodeDisplayData.y, ratio: 0.5 }, { duration: 500 })
        }
      }
    }

    sigmaRef.current.refresh()
  }, [selectedNode, graphData])

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-background"
      style={{
        backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
        border: theme === 'high-contrast' ? '2px solid currentColor' : 'none'
      }}
      role="img"
      aria-label="Knowledge graph visualization showing relationships between user data, preferences, and browsing history"
      tabIndex={0}
    />
  )
}
