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
    onTextConfirmed?: (text: string, order: number) => void
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

// Module-level singleton for WebSocket connection - prevents duplicates across React re-renders
let globalWs: WebSocket | null = null
let globalSessionId: string | null = null
let globalConnectPromise: Promise<void> | null = null
let globalConnectionRefCount = 0

// Reset globals on window load or HMR to ensure clean state on app startup
// This fixes issues where loading an existing session fails due to stale globals
const resetGlobals = () => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
        globalWs.close()
    }
    globalWs = null
    globalSessionId = null
    globalConnectPromise = null
    globalConnectionRefCount = 0
}

// Run reset on initial module load
resetGlobals()

// Also reset on HMR (Vite's hot module replacement)
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        resetGlobals()
    })
}

export function useRealtime(options: UseRealtimeOptions = {}) {
    const [state, setState] = useState<RealtimeState>({
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        userTranscript: '',
        assistantTranscript: ''
    })

    // Store options in a ref to prevent re-creating functions when options change
    const optionsRef = useRef(options)
    useEffect(() => {
        optionsRef.current = options
    }, [options])

    // Refs to keep track of state without triggering re-renders in callbacks
    const wsRef = useRef<WebSocket | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
    const workletNodeRef = useRef<AudioWorkletNode | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const sessionIdRef = useRef<string | null>(null)

    // Global initialization promise to prevent race conditions
    const audioInitPromiseRef = useRef<Promise<AudioContext> | null>(null)

    // Initialize audio context (idempotent)
    const initAudioContext = useCallback(async () => {
        // If we already have a running context, just return it
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume()
            }
            return audioContextRef.current
        }

        // Use global promise logic (stored in ref for this hook instance, but we need module-level too really)
        // Actually, for AudioWorklet, we need to be careful.
        // Let's use a simpler approach: Try to create context, try to add module.
        // If addModule fails because "already registered", that's FINE.

        try {
            const ctx = new AudioContext()
            audioContextRef.current = ctx

            // Resume if suspended
            if (ctx.state === 'suspended') {
                await ctx.resume()
            }

            // Add worklet module
            try {
                const blob = new Blob([workletCode], { type: 'application/javascript' })
                const workletUrl = URL.createObjectURL(blob)
                await ctx.audioWorklet.addModule(workletUrl)
                URL.revokeObjectURL(workletUrl)
            } catch (e: any) {
                // Ignore "already registered" error, or any error really if it works
                if (!e.message?.includes('already registered')) {
                    console.warn('Worklet module loading warning (continuing):', e)
                }
            }
            return ctx
        } catch (e) {
            console.error('Failed to init audio context:', e)
            throw e
        }
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
                    optionsRef.current.onUserTranscript?.(data.text, data.order ?? Date.now())
                    break
                case 'assistant_transcript_delta':
                    setState(s => ({
                        ...s,
                        assistantTranscript: s.assistantTranscript + data.text
                    }))
                    break
                case 'assistant_transcript_done':
                    setState(s => ({ ...s, assistantTranscript: data.text }))
                    optionsRef.current.onAssistantTranscript?.(data.text, data.order ?? Date.now())
                    break
                case 'task_requested':
                    optionsRef.current.onTaskRequested?.({
                        taskPrompt: data.task_prompt,
                        callId: data.call_id
                    })
                    break
                case 'text_confirmed':
                    // Backend confirms text message with order for proper sorting
                    optionsRef.current.onTextConfirmed?.(data.text, data.order)
                    break
                case 'ready':
                    console.log('[Realtime] Session ready')
                    break
                case 'response_done':
                    setState(s => ({ ...s, assistantTranscript: '' }))
                    break
                case 'error':
                    console.error('[Realtime] Error:', data.message)
                    optionsRef.current.onError?.(data.message)
                    break
            }
        } catch (e) {
            console.error('[Realtime] Failed to parse message:', e)
        }
    }, [playAudio])

    // Track if this hook instance has contributed to the global ref count
    const hasConnectedRef = useRef(false)

    // Connect to realtime session - uses module-level singleton
    const connect = useCallback(async (sessionId: string) => {
        // Increment reference count ONLY if we haven't already for this instance
        if (!hasConnectedRef.current) {
            globalConnectionRefCount++
            hasConnectedRef.current = true
            console.log('[Realtime] Connect called, refCount:', globalConnectionRefCount, 'SessionId:', sessionId)
        } else {
            console.log('[Realtime] Connect called (already tracking), refCount:', globalConnectionRefCount, 'SessionId:', sessionId)
        }

        // If already connected or connecting to the same session, don't reconnect
        const wsState = globalWs?.readyState
        const isConnectedOrConnecting = wsState === WebSocket.OPEN || wsState === WebSocket.CONNECTING

        if (isConnectedOrConnecting && globalSessionId === sessionId) {
            console.log('[Realtime] Already connected/connecting to session:', sessionId)
            // Sync local ref with global
            wsRef.current = globalWs
            sessionIdRef.current = globalSessionId

            // CRITICAL: Ensure local state reflects connection, otherwise consumers might retry
            setState(s => ({ ...s, isConnected: true }))

            if (globalConnectPromise) {
                return globalConnectPromise
            }
            return
        }

        // If connected to a different session, disconnect first (force close old one)
        if (wsState === WebSocket.OPEN && globalSessionId !== sessionId) {
            console.log('[Realtime] Session changed, disconnecting from old session:', globalSessionId)
            if (globalWs) {
                globalWs.close()
                globalWs = null
            }
            globalSessionId = null
            globalConnectPromise = null // Clear old promise so new session can connect
            wsRef.current = null
            sessionIdRef.current = null
            globalConnectionRefCount = 1 // Reset ref count for new session
            setState(s => ({ ...s, isConnected: false }))
        }

        // Wait for existing connection attempt
        if (globalConnectPromise) {
            return globalConnectPromise
        }

        console.log('[Realtime] Connecting to session:', sessionId)
        globalSessionId = sessionId
        sessionIdRef.current = sessionId

        // Start connection process immediately and assign to global promise
        // This prevents race conditions where multiple calls enter before the first one sets the promise
        globalConnectPromise = (async () => {
            try {
                // Initialize audio context early
                try {
                    await initAudioContext()
                } catch (e) {
                    console.error('[Realtime] Failed to init audio context:', e)
                }

                // Create WebSocket using a new promise that resolves when open
                await new Promise<void>((resolve, reject) => {
                    const ws = new WebSocket(`${BACKEND_WS_URL}/realtime/session/${sessionId}`)
                    globalWs = ws
                    wsRef.current = ws

                    ws.onopen = () => {
                        console.log('[Realtime] Connected')
                        setState(s => ({ ...s, isConnected: true }))
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

                        // Only clear globals if this was the active connection
                        if (globalWs === ws) {
                            globalConnectPromise = null
                            globalWs = null
                            globalSessionId = null
                            globalConnectionRefCount = 0
                        }
                        wsRef.current = null
                        // If connection was pending, reject it
                        reject(new Error('WebSocket closed'))
                    }

                    ws.onerror = (e) => {
                        console.error('[Realtime] WebSocket error:', e)
                        optionsRef.current.onError?.('WebSocket connection failed')
                        if (globalWs === ws) {
                            globalConnectPromise = null
                            globalWs = null
                            globalSessionId = null
                            globalConnectionRefCount = 0
                        }
                        wsRef.current = null
                        reject(new Error('WebSocket connection failed'))
                    }
                })
            } catch (e) {
                // Determine if we should clear the global promise
                // If we failed, we probably should so next attempt can try again
                if (globalSessionId === sessionId) {
                    globalConnectPromise = null
                    globalWs = null
                    globalSessionId = null
                }
                throw e
            }
        })()

        return globalConnectPromise
    }, [handleMessage, initAudioContext, cleanupAudio])

    // Disconnect from realtime session
    const disconnect = useCallback(() => {
        stopListening()


        globalConnectionRefCount--
        console.log('[Realtime] Disconnect called, refCount:', globalConnectionRefCount)

        if (globalConnectionRefCount <= 0) {
            console.log('[Realtime] RefCount 0, closing WebSocket')
            if (globalWs) {
                globalWs.close()
                globalWs = null
            }
            globalSessionId = null
            globalConnectPromise = null
            globalConnectionRefCount = 0
        } else {
            console.log('[Realtime] RefCount > 0, keeping WebSocket open')
        }

        wsRef.current = null
        sessionIdRef.current = null

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
        if (globalConnectPromise) {
            try {
                await globalConnectPromise
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
            optionsRef.current.onError?.(msg)
            return false
        }
    }, [float32ToPcm16Base64, initAudioContext, resampleTo24k])

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

    // Send text message through Realtime API (unified pipeline)
    const sendTextMessage = useCallback(async (text: string): Promise<boolean> => {
        // Wait for any pending connection
        if (globalConnectPromise) {
            try {
                await globalConnectPromise
            } catch (e) {
                console.error('[Realtime] Connection failed while waiting to send message')
                return false
            }
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'text',
                content: text
            }))
            return true
        }
        return false
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
        sendTaskResult,
        sendTextMessage
    }
}
