import { useEffect } from 'react'

// Type-safe wrapper around window.electron API
export function useIPC() {
  return window.electron
}

// Hook for listening to streaming messages
export function useStreamingMessages(
  onStart: (messageId: string) => void,
  onChunk: (data: { id: string; chunk: string }) => void,
  onEnd: (data: { id: string; taskPrompt: string | null; taskId: string | null }) => void,
  onError?: (error: string) => void
) {
  const electron = useIPC()

  useEffect(() => {
    const unsubStart = electron.onStreamStart(onStart)
    const unsubChunk = electron.onStreamChunk(onChunk)
    const unsubEnd = electron.onStreamEnd(onEnd)
    const unsubError = onError ? electron.onStreamError(onError) : undefined

    return () => {
      unsubStart()
      unsubChunk()
      unsubEnd()
      if (unsubError) unsubError()
    }
  }, [electron, onStart, onChunk, onEnd, onError])
}
