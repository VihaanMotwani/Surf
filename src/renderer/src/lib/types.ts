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
  taskSteps?: Array<Record<string, unknown>>
  isAutoSummary?: boolean // True if this is an auto-generated task completion summary
  audioPlayed?: boolean // Track if TTS audio has been played for this message
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
  speechSpeed: number // OpenAI TTS speed (0.25 to 4.0)
  selectedVoice: string // OpenAI voice: alloy, echo, fable, onyx, nova, shimmer
  ttsModel: 'tts-1' | 'tts-1-hd' // OpenAI TTS model
  autoSpeak: boolean
}

export type ViewType = 'chat' | 'graph' | 'sessions'
