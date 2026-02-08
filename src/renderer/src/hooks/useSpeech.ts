import { useState, useCallback, useRef, useEffect } from 'react'
import { useSettingsStore } from '@/store/settings'

const BACKEND_URL = 'http://127.0.0.1:8000'

// OpenAI Realtime API voices (different from TTS API voices)
export const OPENAI_VOICES = [
  { name: 'alloy', description: 'Neutral and balanced voice' },
  { name: 'ash', description: 'Warm, conversational voice' },
  { name: 'ballad', description: 'Expressive, storytelling voice' },
  { name: 'coral', description: 'Friendly and engaging voice' },
  { name: 'echo', description: 'Clear, articulate voice' },
  { name: 'sage', description: 'Calm and thoughtful voice' },
  { name: 'shimmer', description: 'Bright and energetic voice' },
  { name: 'verse', description: 'Dynamic and versatile voice' }
]

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<string[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  const settings = useSettingsStore()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const speak = useCallback(
    async (text: string) => {
      if (!text) return

      // Stop any ongoing speech
      stop()

      setIsSpeaking(true)
      abortControllerRef.current = new AbortController()

      try {
        const requestBody = {
          text,
          voice: settings.selectedVoice || 'nova',
          model: settings.ttsModel || 'tts-1',
          speed: settings.speechSpeed || 1.0
        }

        console.log('TTS request:', requestBody)

        // Call backend TTS API
        const response = await fetch(`${BACKEND_URL}/speech/synthesize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('TTS error response:', errorText)
          throw new Error(`TTS failed: ${response.statusText}`)
        }

        // Get audio blob
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)

        // Create and play audio
        const audio = new Audio(audioUrl)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          setIsSpeaking(false)

          // Process next item in queue
          if (queueRef.current.length > 0) {
            const next = queueRef.current.shift()
            if (next) speak(next)
          }
        }

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl)
          setIsSpeaking(false)
          console.error('Audio playback error')
        }

        await audio.play()
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Intentional abort, not an error
          return
        }
        console.error('TTS error:', error)
        setIsSpeaking(false)
      }
    },
    [settings.selectedVoice, settings.ttsModel, settings.speechSpeed]
  )

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    queueRef.current = []
    setIsSpeaking(false)
  }, [])

  const addToQueue = useCallback((text: string) => {
    queueRef.current.push(text)
    if (!isSpeaking) {
      const next = queueRef.current.shift()
      if (next) speak(next)
    }
  }, [isSpeaking, speak])

  return {
    speak,
    stop,
    addToQueue,
    isSpeaking,
    voices: OPENAI_VOICES
  }
}

// Hook for audio recording via MediaRecorder (sends to backend for Whisper transcription)
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start(100)
      setIsRecording(true)
      return true
    } catch (error) {
      console.error('Failed to start recording:', error)
      return false
    }
  }, [])

  const stopRecording = useCallback(
    async (): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> => {
      return new Promise((resolve) => {
        const mediaRecorder = mediaRecorderRef.current
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          setIsRecording(false)
          resolve(null)
          return
        }

        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
          const buffer = await blob.arrayBuffer()
          mediaRecorder.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
          setIsRecording(false)
          resolve({ buffer, mimeType: mediaRecorder.mimeType })
        }

        mediaRecorder.stop()
      })
    },
    []
  )

  return { isRecording, startRecording, stopRecording }
}

// Placeholder for speech recognition (kept for backwards compat)
export function useSpeechRecognition() {
  const [isListening] = useState(false)
  const [transcript] = useState('')
  const start = useCallback(async () => ({ success: false, error: 'Use useAudioRecorder instead' }), [])
  const stop = useCallback(() => { }, [])
  return { start, stop, isListening, transcript }
}
