import { useEffect, useRef } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { useGraphStore } from '@/store/graph'
import { useSettingsStore } from '@/store/settings'
import { circular } from 'graphology-layout'

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

    // Add nodes with better positioning
    graphData.nodes.forEach((node, index) => {
      const angle = (index / graphData.nodes.length) * 2 * Math.PI
      const radius = 200

      graph.addNode(node.id, {
        label: node.label,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        size: node.size || 15,
        color: node.color || (theme === 'dark' ? '#888' : '#666'),
      })
    })

    // Add edges
    graphData.edges.forEach((edge) => {
      try {
        if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
          graph.addEdge(edge.source, edge.target, {
            label: edge.label,
            size: 2,
            color: theme === 'dark' ? '#555' : '#ccc'
          })
        }
      } catch (error) {
        console.warn('Failed to add edge:', edge, error)
      }
    })

    // Apply circular layout for initial positioning
    circular.assign(graph, { scale: 300 })

    // Initialize Sigma with better settings
    try {
      const sigma = new Sigma(graph, containerRef.current, {
        renderEdgeLabels: true,
        defaultNodeColor: theme === 'dark' ? '#888' : '#666',
        defaultEdgeColor: theme === 'dark' ? '#555' : '#ccc',
        labelFont: 'Inter, system-ui, sans-serif',
        labelSize: 14,
        labelWeight: '500',
        labelColor: { color: theme === 'dark' ? '#ddd' : '#333' }
      })

      sigmaRef.current = sigma

      // Handle node clicks
      sigma.on('clickNode', ({ node }) => {
        const nodeData = graphData.nodes.find((n) => n.id === node)
        if (nodeData) {
          setSelectedNode(nodeData)
          // Highlight selected node
          graph.forEachNode((n) => {
            graph.setNodeAttribute(n, 'size', graphData.nodes.find(nd => nd.id === n)?.size || 15)
          })
          graph.setNodeAttribute(node, 'size', 25)
          sigma.refresh()
        }
      })

      // Handle node hover
      sigma.on('enterNode', ({ node }) => {
        const nodeDisplayData = sigma.getNodeDisplayData(node)
        if (nodeDisplayData) {
          containerRef.current!.style.cursor = 'pointer'
        }
      })

      sigma.on('leaveNode', () => {
        containerRef.current!.style.cursor = 'default'
      })
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

    // Reset all node sizes
    graph.forEachNode((node: string) => {
      const nodeData = graphData.nodes.find(n => n.id === node)
      graph.setNodeAttribute(node, 'size', nodeData?.size || 15)
    })

    // Highlight selected node
    if (selectedNode) {
      if (graph.hasNode(selectedNode.id)) {
        graph.setNodeAttribute(selectedNode.id, 'size', 25)

        // Center camera on selected node
        const nodeDisplayData = sigmaRef.current.getNodeDisplayData(selectedNode.id)
        if (nodeDisplayData) {
          const camera = sigmaRef.current.getCamera()
          camera.animate({ x: nodeDisplayData.x, y: nodeDisplayData.y }, { duration: 500 })
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
