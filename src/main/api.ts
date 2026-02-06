// Backend API client for the main process

const API_BASE = 'http://127.0.0.1:8000'

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export interface SSEEvent {
  type: string
  [key: string]: unknown
}

async function parseSSE(res: Response, onEvent: (event: SSEEvent) => void): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(trimmed.slice(6)))
        } catch {
          // skip malformed
        }
      }
    }
  }

  if (buffer.trim().startsWith('data: ')) {
    try {
      onEvent(JSON.parse(buffer.trim().slice(6)))
    } catch {
      // skip
    }
  }
}

export async function apiPostStream(
  path: string,
  body: unknown,
  onEvent: (event: SSEEvent) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  await parseSSE(res, onEvent)
}

export async function apiPostAudioStream(
  path: string,
  audioBuffer: Buffer,
  mimeType: string,
  onEvent: (event: SSEEvent) => void
): Promise<void> {
  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'wav'
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType })

  const formData = new FormData()
  formData.append('file', blob, `audio.${ext}`)

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  await parseSSE(res, onEvent)
}
