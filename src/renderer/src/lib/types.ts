// Core type definitions for the Surf application

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
  taskId?: string
  taskStatus?: 'running' | 'succeeded' | 'failed'
  taskResult?: Record<string, unknown>
}

export interface GraphNode {
  id: string
  label: string
  type: 'user' | 'preference' | 'website' | 'task' | 'memory' | 'fact'
  x?: number
  y?: number
  size?: number
  color?: string
  metadata?: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
  type?: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Session {
  id: string
  title: string | null
  status: string
  message_count: number
  created_at: string
  updated_at: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'high-contrast'
  textScale: number
  reducedMotion: boolean
  speechRate: number
  speechPitch: number
  speechVolume: number
  selectedVoice: string | null
  autoSpeak: boolean
}

export type ViewType = 'chat' | 'graph' | 'sessions'
