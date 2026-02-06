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

// Hook for speech recognition (placeholder)
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, _setTranscript] = useState('')

  const start = useCallback(async () => {
    // TODO: Implement actual speech-to-text
    // For now, show a placeholder message
    console.log('Speech recognition not yet implemented')
    return {
      success: false,
      error: 'Speech-to-text not yet implemented'
    }
  }, [])

  const stop = useCallback(() => {
    setIsListening(false)
  }, [])

  return {
    start,
    stop,
    isListening,
    transcript
  }
}
