import { useEffect, useState, useCallback, useRef } from 'react'
import { useSettingsStore } from '@/store/settings'

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const queueRef = useRef<string[]>([])

  const settings = useSettingsStore()

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      setVoices(availableVoices)
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (!text) return

      // Cancel any ongoing speech
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utteranceRef.current = utterance

      // Apply settings
      utterance.rate = settings.speechRate
      utterance.pitch = settings.speechPitch
      utterance.volume = settings.speechVolume

      // Set voice if selected
      if (settings.selectedVoice) {
        const voice = voices.find((v) => v.name === settings.selectedVoice)
        if (voice) {
          utterance.voice = voice
        }
      }

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => {
        setIsSpeaking(false)
        // Process next item in queue
        if (queueRef.current.length > 0) {
          const next = queueRef.current.shift()
          if (next) speak(next)
        }
      }
      utterance.onerror = () => setIsSpeaking(false)

      window.speechSynthesis.speak(utterance)
    },
    [settings, voices]
  )

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    queueRef.current = []
    setIsSpeaking(false)
  }, [])

  const pause = useCallback(() => {
    window.speechSynthesis.pause()
  }, [])

  const resume = useCallback(() => {
    window.speechSynthesis.resume()
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
    pause,
    resume,
    addToQueue,
    isSpeaking,
    voices
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
  const stop = useCallback(() => {}, [])
  return { start, stop, isListening, transcript }
}
