import { create } from 'zustand'
import { GraphData, GraphNode } from '@/lib/types'

interface GraphState {
  graphData: GraphData | null
  selectedNode: GraphNode | null
  isLoading: boolean
  viewMode: 'graph' | 'table'
  setGraphData: (data: GraphData) => void
  setSelectedNode: (node: GraphNode | null) => void
  setLoading: (isLoading: boolean) => void
  setViewMode: (mode: 'graph' | 'table') => void
}

export const useGraphStore = create<GraphState>((set) => ({
  graphData: null,
  selectedNode: null,
  isLoading: false,
  viewMode: 'graph',

  setGraphData: (data) => set({ graphData: data }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setLoading: (isLoading) => set({ isLoading }),
  setViewMode: (mode) => set({ viewMode: mode })
}))
