import { useEffect, useRef } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { useGraphStore } from '@/store/graph'

export function GraphVisualization() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const { graphData, setSelectedNode } = useGraphStore()

  useEffect(() => {
    if (!containerRef.current || !graphData) return

    // Create graph
    const graph = new Graph() as any

    // Add nodes
    graphData.nodes.forEach((node) => {
      graph.addNode(node.id, {
        label: node.label,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: node.size || 10,
        color: node.color || '#666',
        type: node.type
      })
    })

    // Add edges
    graphData.edges.forEach((edge) => {
      try {
        graph.addEdge(edge.source, edge.target, {
          label: edge.label,
          type: 'arrow'
        })
      } catch (error) {
        console.warn('Failed to add edge:', edge, error)
      }
    })

    // Initialize Sigma
    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: true,
      defaultNodeColor: '#666',
      defaultEdgeColor: '#ccc',
      labelFont: 'Arial, sans-serif',
      labelSize: 12,
      labelWeight: 'normal'
    })

    sigmaRef.current = sigma

    // Handle node clicks
    sigma.on('clickNode', ({ node }) => {
      const nodeData = graphData.nodes.find((n) => n.id === node)
      if (nodeData) {
        setSelectedNode(nodeData)
      }
    })

    // Handle keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      const nodes = graph.nodes()
      if (nodes.length === 0) return

      // Simple keyboard navigation through nodes
      if (e.key === 'Tab') {
        e.preventDefault()
        const currentIndex = 0 // TODO: Track current selection
        const nextNode = nodes[currentIndex]
        const nodeData = graphData.nodes.find((n) => n.id === nextNode)
        if (nodeData) {
          setSelectedNode(nodeData)
        }
      }
    }

    containerRef.current.addEventListener('keydown', handleKeyDown)

    return () => {
      sigma.kill()
      containerRef.current?.removeEventListener('keydown', handleKeyDown)
    }
  }, [graphData, setSelectedNode])

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-background"
      role="img"
      aria-label="Knowledge graph visualization showing relationships between user data, preferences, and browsing history"
      tabIndex={0}
    />
  )
}
