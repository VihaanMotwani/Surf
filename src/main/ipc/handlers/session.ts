import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'

// TODO: Integrate with actual backend session storage
// This is a placeholder implementation with mock session data

interface Session {
  id: string
  title: string
  description: string
  timestamp: number
  duration: number
  outcome: 'success' | 'partial' | 'failed'
  actions: string[]
  urlsVisited: string[]
}

const mockSessions: Session[] = [
  {
    id: 'session-1',
    title: 'Morning Email Check',
    description: 'Checked and responded to 5 important emails',
    timestamp: Date.now() - 3600000, // 1 hour ago
    duration: 420, // 7 minutes in seconds
    outcome: 'success',
    actions: ['Logged into Gmail', 'Read 5 emails', 'Replied to 2 emails', 'Archived 3 emails'],
    urlsVisited: ['https://mail.google.com', 'https://mail.google.com/mail/u/0/#inbox']
  },
  {
    id: 'session-2',
    title: 'Weather Check',
    description: 'Checked weather forecast for the week',
    timestamp: Date.now() - 7200000, // 2 hours ago
    duration: 120, // 2 minutes in seconds
    outcome: 'success',
    actions: ['Navigated to weather.com', 'Found forecast', 'Read 5-day forecast'],
    urlsVisited: ['https://weather.com', 'https://weather.com/weather/tenday']
  },
  {
    id: 'session-3',
    title: 'Online Shopping',
    description: 'Searched for laptop accessories (incomplete)',
    timestamp: Date.now() - 86400000, // 1 day ago
    duration: 900, // 15 minutes in seconds
    outcome: 'partial',
    actions: [
      'Navigated to Amazon',
      'Searched for "laptop stand"',
      'Viewed 3 products',
      'Session interrupted before purchase'
    ],
    urlsVisited: [
      'https://amazon.com',
      'https://amazon.com/s?k=laptop+stand',
      'https://amazon.com/dp/B07PRODUCT1',
      'https://amazon.com/dp/B07PRODUCT2'
    ]
  },
  {
    id: 'session-4',
    title: 'News Reading',
    description: 'Read tech news articles',
    timestamp: Date.now() - 172800000, // 2 days ago
    duration: 1200, // 20 minutes in seconds
    outcome: 'success',
    actions: [
      'Navigated to Hacker News',
      'Read 5 articles',
      'Visited linked articles',
      'Bookmarked 2 articles'
    ],
    urlsVisited: [
      'https://news.ycombinator.com',
      'https://example.com/article1',
      'https://example.com/article2'
    ]
  }
]

export function registerSessionHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ALL, async () => {
    // Simulate some delay
    await new Promise((resolve) => setTimeout(resolve, 300))
    return mockSessions
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_BY_ID, async (_event, sessionId: string) => {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const session = mockSessions.find((s) => s.id === sessionId)
    return session || null
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_RESUME, async (_event, sessionId: string) => {
    // TODO: Implement actual session resumption
    await new Promise((resolve) => setTimeout(resolve, 500))
    return { success: true, sessionId, message: 'Session resumption not yet implemented' }
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, async (_event, sessionId: string) => {
    // TODO: Delete from actual backend
    const index = mockSessions.findIndex((s) => s.id === sessionId)
    if (index !== -1) {
      mockSessions.splice(index, 1)
      return { success: true, sessionId }
    }
    return { success: false, sessionId, error: 'Session not found' }
  })
}
