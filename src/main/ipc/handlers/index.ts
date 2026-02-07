import { registerChatHandlers } from './chat'
import { registerKnowledgeGraphHandlers } from './knowledge-graph'
import { registerSessionHandlers } from './session'
import { registerSpeechHandlers } from './speech'
import { registerSettingsHandlers } from './settings'
import { registerMessageEventHandlers } from './messageEvents'

export function registerIpcHandlers(): void {
  registerChatHandlers()
  registerKnowledgeGraphHandlers()
  registerSessionHandlers()
  registerSpeechHandlers()
  registerSettingsHandlers()
  registerMessageEventHandlers()
}
