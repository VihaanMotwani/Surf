import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'

// TODO: Integrate with actual backend
// This is a placeholder implementation with mock streaming responses

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const chatHistory: ChatMessage[] = []

export function registerChatHandlers(): void {
  // Handle sending a message and returning a streaming response
  ipcMain.handle(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (event, message: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: Date.now()
    }

    chatHistory.push(userMessage)

    // Simulate streaming response
    const assistantMessageId = (Date.now() + 1).toString()
    const fullResponse = generateMockResponse(message)

    // Send stream start event
    event.sender.send(IPC_CHANNELS.CHAT_STREAM_START, assistantMessageId)

    // Simulate streaming by sending chunks
    const words = fullResponse.split(' ')
    for (let i = 0; i < words.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 50))
      const chunk = (i === 0 ? '' : ' ') + words[i]
      event.sender.send(IPC_CHANNELS.CHAT_STREAM_CHUNK, {
        id: assistantMessageId,
        chunk
      })
    }

    // Send stream end event
    event.sender.send(IPC_CHANNELS.CHAT_STREAM_END, assistantMessageId)

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: fullResponse,
      timestamp: Date.now()
    }

    chatHistory.push(assistantMessage)

    return { id: assistantMessageId, message: fullResponse }
  })

  // Get chat history
  ipcMain.handle(IPC_CHANNELS.CHAT_GET_HISTORY, async () => {
    return chatHistory
  })

  // Clear chat history
  ipcMain.handle(IPC_CHANNELS.CHAT_CLEAR_HISTORY, async () => {
    chatHistory.length = 0
    return { success: true }
  })
}

function generateMockResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase()

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return "Hello! I'm Surf, your speech-driven web assistant. I'm here to help you browse the web, search for information, and complete tasks using voice commands. How can I assist you today?"
  }

  if (lowerMessage.includes('search') || lowerMessage.includes('find')) {
    return "I'd be happy to help you search for that. In the full version, I would open a browser and perform the search using automated browsing. For now, this is a UI demo showing how the conversation interface works with streaming responses."
  }

  if (lowerMessage.includes('weather')) {
    return "To check the weather, I would navigate to a weather website and extract the current conditions for your location. The browser automation system would handle clicking through any pop-ups and finding the relevant information for you."
  }

  if (lowerMessage.includes('email') || lowerMessage.includes('mail')) {
    return "I can help you with email tasks! In the full implementation, I would be able to log into your email, read messages, compose replies, and organize your inbox - all while you use voice commands to guide the process."
  }

  return `I understand you said: "${userMessage}". This is a demonstration of the Surf UI with streaming responses. In the full version, I would process your request using browser automation, navigate websites as needed, and help you complete the task using voice interaction throughout the process.`
}
