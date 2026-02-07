import { useState, useCallback, useRef, useEffect } from 'react'

const BACKEND_WS_URL = 'ws://127.0.0.1:8000'

interface RealtimeState {
    isConnected: boolean
    isListening: boolean
    isSpeaking: boolean
    userTranscript: string
    assistantTranscript: string
}

interface TaskRequest {
    taskPrompt: string
    callId: string
}

interface UseRealtimeOptions {
    onTaskRequested?: (task: TaskRequest) => void
    onUserTranscript?: (text: string, order: number) => void
    onAssistantTranscript?: (text: string, order: number) => void
    onError?: (message: string) => void
}

// Inline AudioWorklet processor code
const workletCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    if (input && input.length > 0) {
      const channelData = input[0]
      if (channelData) {
        // Send data to main thread
        this.port.postMessage(channelData)
      }
    }
    return true
  }
}

registerProcessor('audio-processor', AudioProcessor)
`

export function useRealtime(options: UseRealtimeOptions = {}) {
    const [state, setState] = useState<RealtimeState>({
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        userTranscript: '',
        assistantTranscript: ''
    })

    // Refs to keep track of state without triggering re-renders in callbacks
    const wsRef = useRef<WebSocket | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
    const workletNodeRef = useRef<AudioWorkletNode | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const sessionIdRef = useRef<string | null>(null)

    // Initialize audio context
    const initAudioContext = useCallback(async () => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new AudioContext()
        }

        // Resume if suspended
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume()
        }

        // Add worklet module if not already added
        try {
            // Check if we already registered the worklet to avoid errors
            // Actually we can't easily check, but adding module again might be fine or throw
            // We'll use a unique name construction if needed, but simplest is standard Blob approach
            const blob = new Blob([workletCode], { type: 'application/javascript' })
            const workletUrl = URL.createObjectURL(blob)
            await audioContextRef.current.audioWorklet.addModule(workletUrl)
            URL.revokeObjectURL(workletUrl)
        } catch (e) {
            console.warn('Worklet module loading error (might already be loaded):', e)
        }

        return audioContextRef.current
    }, [])

    // Optimized Float32 to PCM16 base64
    const float32ToPcm16Base64 = useCallback((float32Array: Float32Array): string => {
        const len = float32Array.length
        const pcm16 = new Int16Array(len)
        for (let i = 0; i < len; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }

        const bytes = new Uint8Array(pcm16.buffer)

        // Chunk processing
        const chunkCheck = 4096
        let binary = ''
        for (let i = 0; i < bytes.length; i += chunkCheck) {
            const chunk = bytes.subarray(i, Math.min(i + chunkCheck, bytes.length))
            binary += String.fromCharCode.apply(null, Array.from(chunk))
        }
        return btoa(binary)
    }, [])

    // Convert PCM16 base64 to Float32
    const pcm16Base64ToFloat32 = useCallback((base64: string): Float32Array => {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        const pcm16 = new Int16Array(bytes.buffer)
        const float32 = new Float32Array(pcm16.length)
        for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff)
        }
        return float32
    }, [])

    // Resample audio to 24kHz
    const resampleTo24k = useCallback((input: Float32Array, inputSampleRate: number): Float32Array => {
        const TARGET_SAMPLE_RATE = 24000
        if (inputSampleRate === TARGET_SAMPLE_RATE) {
            return input
        }

        const ratio = inputSampleRate / TARGET_SAMPLE_RATE
        const outputLength = Math.floor(input.length / ratio)
        const output = new Float32Array(outputLength)

        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio
            const srcIndexFloor = Math.floor(srcIndex)
            const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1)
            const frac = srcIndex - srcIndexFloor

            output[i] = input[srcIndexFloor] * (1 - frac) + input[srcIndexCeil] * frac
        }

        return output
    }, [])

    // Refs for precise playback scheduling
    const nextStartTimeRef = useRef<number>(0)
    const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Play audio chunk with precise scheduling
    const playAudio = useCallback((audioData: string) => {
        const ctx = audioContextRef.current
        if (!ctx) return

        // Resume context if suspended (can happen on some browsers)
        if (ctx.state === 'suspended') {
            ctx.resume().catch(console.error)
        }

        const float32 = pcm16Base64ToFloat32(audioData)
        const buffer = ctx.createBuffer(1, float32.length, 24000)
        buffer.getChannelData(0).set(float32)

        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)

        const currentTime = ctx.currentTime

        // Schedule ahead: ensure we don't schedule in the past
        // If nextStartTime is in the past, reset it to now (handling gaps)
        // Add a tiny offset (latency) for new streams to allow scheduling
        if (nextStartTimeRef.current < currentTime) {
            nextStartTimeRef.current = currentTime + 0.05 // 50ms buffer
        }

        source.start(nextStartTimeRef.current)
        nextStartTimeRef.current += buffer.duration

        // Update speaking state
        setState(s => s.isSpeaking ? s : { ...s, isSpeaking: true })

        // Clear existing timeout
        if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current)
        }

        // Set timeout to reset speaking state after this chunk (plus a small buffer)
        // We calculate time remaining until this chunk finishes
        const timeUntilEnd = (nextStartTimeRef.current - ctx.currentTime) * 1000
        speakingTimeoutRef.current = setTimeout(() => {
            setState(s => ({ ...s, isSpeaking: false }))
        }, timeUntilEnd + 100)

    }, [pcm16Base64ToFloat32])

    // Stop listening logic
    const cleanupAudio = useCallback(() => {
        if (sourceRef.current) {
            sourceRef.current.disconnect()
            sourceRef.current = null
        }
        if (workletNodeRef.current) {
            workletNodeRef.current.port.onmessage = null
            workletNodeRef.current.disconnect()
            workletNodeRef.current = null
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }
        // Clear scheduling state
        nextStartTimeRef.current = 0
        if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current)
        }
    }, [])

    const stopListening = useCallback(() => {
        cleanupAudio()
        setState(s => ({ ...s, isListening: false }))
        console.log('[Realtime] Stopped listening')
    }, [cleanupAudio])

    // Handle incoming WebSocket messages
    const handleMessage = useCallback((event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data)

            switch (data.type) {
                case 'audio':
                    playAudio(data.data)
                    break
                case 'user_transcript':
                    setState(s => ({ ...s, userTranscript: data.text }))
                    options.onUserTranscript?.(data.text, data.order ?? Date.now())
                    break
                case 'assistant_transcript_delta':
                    setState(s => ({
                        ...s,
                        assistantTranscript: s.assistantTranscript + data.text
                    }))
                    break
                case 'assistant_transcript_done':
                    setState(s => ({ ...s, assistantTranscript: data.text }))
                    options.onAssistantTranscript?.(data.text, data.order ?? Date.now())
                    break
                case 'task_requested':
                    options.onTaskRequested?.({
                        taskPrompt: data.task_prompt,
                        callId: data.call_id
                    })
                    break
                case 'ready':
                    console.log('[Realtime] Session ready')
                    break
                case 'response_done':
                    setState(s => ({ ...s, assistantTranscript: '' }))
                    break
                case 'error':
                    console.error('[Realtime] Error:', data.message)
                    options.onError?.(data.message)
                    break
            }
        } catch (e) {
            console.error('[Realtime] Failed to parse message:', e)
        }
    }, [playAudio, options])

    // Connect to realtime session
    const connectPromiseRef = useRef<Promise<void> | null>(null)

    const connect = useCallback(async (sessionId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return
        }

        if (connectPromiseRef.current) {
            return connectPromiseRef.current
        }

        console.log('[Realtime] Connecting to session:', sessionId)
        sessionIdRef.current = sessionId

        // Initialize audio context early
        try {
            await initAudioContext()
        } catch (e) {
            console.error('[Realtime] Failed to init audio context:', e)
        }

        connectPromiseRef.current = new Promise((resolve, reject) => {
            const ws = new WebSocket(`${BACKEND_WS_URL}/realtime/session/${sessionId}`)
            wsRef.current = ws

            ws.onopen = () => {
                console.log('[Realtime] Connected')
                setState(s => ({ ...s, isConnected: true }))
                connectPromiseRef.current = null
                resolve()
            }

            ws.onmessage = handleMessage

            ws.onclose = () => {
                console.log('[Realtime] Disconnected')
                setState(s => ({
                    ...s,
                    isConnected: false,
                    isListening: false,
                    isSpeaking: false
                }))
                cleanupAudio()
                connectPromiseRef.current = null
                // If connection was pending, reject it
                reject(new Error('WebSocket closed'))
            }

            ws.onerror = (e) => {
                console.error('[Realtime] WebSocket error:', e)
                options.onError?.('WebSocket connection failed')
                connectPromiseRef.current = null
                reject(new Error('WebSocket connection failed'))
            }
        })

        return connectPromiseRef.current
    }, [handleMessage, initAudioContext, cleanupAudio, options])

    // Disconnect from realtime session
    const disconnect = useCallback(() => {
        stopListening()
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
        sessionIdRef.current = null
        connectPromiseRef.current = null
        setState({
            isConnected: false,
            isListening: false,
            isSpeaking: false,
            userTranscript: '',
            assistantTranscript: ''
        })
    }, [stopListening])

    // Start listening (capture microphone)
    const startListening = useCallback(async () => {
        // If connecting, wait for it
        if (connectPromiseRef.current) {
            try {
                await connectPromiseRef.current
            } catch (e) {
                console.error('Connection failed while waiting to start listening')
                return false
            }
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            // Try to reconnect if sessionId is known
            if (sessionIdRef.current) {
                try {
                    await connect(sessionIdRef.current)
                } catch (e) {
                    console.error('Failed to reconnect:', e)
                    options.onError?.('Failed to connect to server')
                    return false
                }
            } else {
                console.error('[Realtime] Not connected')
                options.onError?.('Not connected to server')
                return false
            }
        }

        // Check permissions status if available
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
                console.log('[Realtime] Microphone permission state:', status.state)
                if (status.state === 'denied') {
                    options.onError?.('Microphone permission denied. Please reset permissions in System Settings.')
                    return false
                }
            }
        } catch (e) {
            console.warn('[Realtime] Failed to check permissions:', e)
        }

        try {
            // Try with minimal constraints first to ensure we can get any stream
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
                // We previously used specific constraints, but they might fail on some devices
                // audio: {
                //     echoCancellation: true,
                //     noiseSuppression: true,
                //     autoGainControl: true,
                // }
            })
            streamRef.current = stream

            const ctx = await initAudioContext()

            const source = ctx.createMediaStreamSource(stream)
            sourceRef.current = source

            // Create AudioWorkletNode
            // We reuse the same worklet name 'audio-processor'
            // In case context was re-created or not loaded yet, Ensure module is loaded is done in initAudioContext
            try {
                const workletNode = new AudioWorkletNode(ctx, 'audio-processor')
                workletNodeRef.current = workletNode

                workletNode.port.onmessage = (event) => {
                    if (wsRef.current?.readyState !== WebSocket.OPEN) return

                    const inputData = event.data as Float32Array

                    // Resample if needed
                    const resampled = resampleTo24k(inputData, ctx.sampleRate)
                    const audioB64 = float32ToPcm16Base64(resampled)

                    wsRef.current.send(JSON.stringify({
                        type: 'audio',
                        data: audioB64
                    }))
                }

                source.connect(workletNode)
                workletNode.connect(ctx.destination) // Connect to destination to keep it alive (usually muted output needed)
            } catch (e) {
                console.error('[Realtime] Failed to create AudioWorkletNode:', e)
                options.onError?.(`Audio Error: ${e instanceof Error ? e.message : String(e)}`)
                return false
            }

            setState(s => ({ ...s, isListening: true }))
            console.log('[Realtime] Started listening')
            return true
        } catch (e) {
            console.error('[Realtime] Failed to start listening:', e)
            let msg = 'Failed to access microphone.'
            if (e instanceof DOMException) {
                if (e.name === 'NotAllowedError') {
                    msg = 'Microphone permission denied. Please allow access in System Settings.'
                } else if (e.name === 'NotFoundError') {
                    msg = 'No microphone found.'
                } else if (e.name === 'NotReadableError') {
                    msg = 'Microphone is busy or not readable.'
                } else {
                    msg = `Microphone Error: ${e.name} - ${e.message}`
                }
            } else if (e instanceof Error) {
                msg = `Microphone Error: ${e.message}`
            }
            options.onError?.(msg)
            return false
        }
    }, [float32ToPcm16Base64, initAudioContext, options, resampleTo24k])

    // Send task result back to OpenAI
    const sendTaskResult = useCallback((callId: string, result: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'task_result',
                call_id: callId,
                result
            }))
        }
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupAudio()
            if (wsRef.current) {
                // Prevent state updates by removing listeners before closing
                wsRef.current.onclose = null
                wsRef.current.onerror = null
                wsRef.current.onmessage = null
                wsRef.current.close()
                wsRef.current = null
            }
            if (audioContextRef.current) {
                audioContextRef.current.close()
            }
        }
    }, [cleanupAudio])

    return {
        ...state,
        connect,
        disconnect,
        startListening,
        stopListening,
        sendTaskResult
    }
}
