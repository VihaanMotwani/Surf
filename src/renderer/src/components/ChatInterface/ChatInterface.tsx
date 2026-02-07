import { useCallback, useEffect, useRef } from 'react'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { useChatStore } from '@/store/chat'
import { useIPC } from '@/hooks/useIPC'
import { useSpeech } from '@/hooks/useSpeech'
import { useSettingsStore } from '@/store/settings'
import { useToast } from '@/components/ui/use-toast'

export function ChatInterface() {
  const electron = useIPC()
  const { sessionId, addMessage, appendToMessage, setStreamingStatus, setTaskInfo, addTaskStep, setSessionId, setLoading, loadSession } =
    useChatStore()
  const { speak } = useSpeech()
  const settings = useSettingsStore()
  const { toast } = useToast()
  const sessionCreatingRef = useRef(false)
  const messagesRef = useRef(useChatStore.getState().messages)
  const taskPollIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  // Keep ref in sync with store
  useEffect(() => {
    return useChatStore.subscribe((state) => {
      messagesRef.current = state.messages
    })
  }, [])

  // Load last session or create new one on mount only
  const hasInitialized = useRef(false)
  useEffect(() => {
    if (hasInitialized.current) return
    const ensureSession = async () => {
      if (sessionId || sessionCreatingRef.current) return
      sessionCreatingRef.current = true
      hasInitialized.current = true
      try {
        // Try to load the most recent session
        const sessions = (await electron.getAllSessions()) as Array<{
          id: string
          title: string | null
          message_count: number
        }>
        if (sessions.length > 0) {
          const latest = sessions[0] // already sorted by updated_at DESC
          if (latest.message_count > 0) {
            const fullSession = (await electron.getSessionById(latest.id)) as {
              id: string
              messages: Array<{ id: string; role: string; content: string; created_at?: string }>
            }
            loadSession(fullSession.id, fullSession.messages)
            return
          }
        }
        // No existing sessions with messages — create a new one
        const session = await electron.createSession()
        setSessionId(session.id)
      } catch {
        toast({
          variant: 'destructive',
          title: 'Connection Error',
          description: 'Could not connect to the backend. Make sure the server is running.'
        })
      } finally {
        sessionCreatingRef.current = false
      }
    }
    ensureSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When sessionId becomes null (e.g. New Chat), create a fresh session
  useEffect(() => {
    if (sessionId !== null || !hasInitialized.current || sessionCreatingRef.current) return
    sessionCreatingRef.current = true
    electron.createSession()
      .then((session) => setSessionId(session.id))
      .catch(() => {
        toast({
          variant: 'destructive',
          title: 'Connection Error',
          description: 'Could not create a new session.'
        })
      })
      .finally(() => { sessionCreatingRef.current = false })
  }, [sessionId, electron, setSessionId, toast])

  const startTaskPolling = useCallback(
    (messageId: string, taskId: string) => {
      setTaskInfo(messageId, taskId, 'running')

      // Start streaming task events for real-time updates
      electron.streamTaskEvents(taskId).catch(console.error)

      const interval = setInterval(async () => {
        try {
          const task = await electron.getTaskStatus(taskId)
          if (task.status === 'succeeded' || task.status === 'failed') {
            clearInterval(interval)
            taskPollIntervals.current.delete(taskId)

            let result: Record<string, unknown> = {}
            if (task.status === 'failed' && task.error) {
              result = { error: task.error }
            } else {
              // Fetch events to get the result payload
              try {
                const events = await electron.getTaskEvents(taskId)
                const resultEvent = events.find((e) => e.type === 'result')
                if (resultEvent?.payload) {
                  result = resultEvent.payload
                }
              } catch {
                result = { final_result: 'Task completed' }
              }
            }

            setTaskInfo(messageId, taskId, task.status as 'succeeded' | 'failed', result)
          }
        } catch {
          // Backend might be temporarily unavailable, keep polling
        }
      }, 2000)

      taskPollIntervals.current.set(taskId, interval)
    },
    [electron, setTaskInfo]
  )

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      taskPollIntervals.current.forEach((interval) => clearInterval(interval))
      taskPollIntervals.current.clear()
    }
  }, [])

  // Set up streaming + transcription listeners
  useEffect(() => {
    const unsubStart = electron.onStreamStart((messageId) => {
      addMessage({
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      })
    })

    const unsubChunk = electron.onStreamChunk(({ id, chunk }) => {
      appendToMessage(id, chunk)
    })

    const unsubEnd = electron.onStreamEnd((data) => {
      setStreamingStatus(data.id, false)
      setLoading(false)

      // Start polling if a browser task was launched
      if (data.taskId) {
        startTaskPolling(data.id, data.taskId)
      }

      // Auto-speak if enabled
      if (settings.autoSpeak) {
        const message = messagesRef.current.find((m) => m.id === data.id)
        if (message) speak(message.content)
      }
    })

    const unsubError = electron.onStreamError((error) => {
      console.error('[stream] error:', error)
      setLoading(false)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error || 'Failed to get response.'
      })
    })

    // When audio is transcribed, show the user message
    const unsubTranscription = electron.onTranscription((data) => {
      addMessage({
        id: `user-voice-${Date.now()}`,
        role: 'user',
        content: data.text,
        timestamp: Date.now()
      })
    })

    // Handle task stream events (real-time step updates)
    const unsubTaskStream = electron.onTaskStreamEvent(({ taskId, event }) => {
      // Find the message associated with this task
      const message = messagesRef.current.find((m) => m.taskId === taskId)
      if (message && event.type === 'step') {
        addTaskStep(message.id, event.payload as Record<string, unknown>)
      }
    })

    return () => {
      unsubStart()
      unsubChunk()
      unsubEnd()
      unsubError()
      unsubTranscription()
      unsubTaskStream()
    }
  }, [electron, addMessage, appendToMessage, setStreamingStatus, setLoading, speak, settings.autoSpeak, toast, startTaskPolling, addTaskStep])

  return (
    <div className="flex h-full flex-col">
      <ChatMessages />
      <ChatInput />
    </div>
  )
}
