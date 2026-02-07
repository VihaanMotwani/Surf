// IPC Channel definitions for type-safe communication

export const IPC_CHANNELS = {
  // Chat channels
  CHAT_SEND_MESSAGE: 'chat:send-message',
  CHAT_SEND_AUDIO: 'chat:send-audio',
  CHAT_UPLOAD_FILE: 'chat:upload-file',
  CHAT_STREAM_START: 'chat:stream-start',
  CHAT_STREAM_CHUNK: 'chat:stream-chunk',
  CHAT_STREAM_END: 'chat:stream-end',
  CHAT_STREAM_ERROR: 'chat:stream-error',
  CHAT_TRANSCRIPTION: 'chat:transcription',
  CHAT_GET_HISTORY: 'chat:get-history',
  CHAT_CLEAR_HISTORY: 'chat:clear-history',

  // Message event channels (for auto-summaries)
  MESSAGE_EVENTS_SUBSCRIBE: 'message-events:subscribe',
  MESSAGE_EVENTS_UNSUBSCRIBE: 'message-events:unsubscribe',
  MESSAGE_EVENT_CREATED: 'message-event:created',
  MESSAGE_EVENT_AUDIO_READY: 'message-event:audio-ready',

  // Knowledge Graph channels
  GRAPH_GET_DATA: 'graph:get-data',
  GRAPH_UPDATE_NODE: 'graph:update-node',
  GRAPH_DELETE_NODE: 'graph:delete-node',
  GRAPH_SEARCH: 'graph:search',

  // Session channels
  SESSION_CREATE: 'session:create',
  SESSION_GET_ALL: 'session:get-all',
  SESSION_GET_BY_ID: 'session:get-by-id',
  SESSION_RESUME: 'session:resume',
  SESSION_DELETE: 'session:delete',

  // Speech channels
  SPEECH_SYNTHESIZE: 'speech:synthesize',
  SPEECH_STOP: 'speech:stop',
  SPEECH_GET_VOICES: 'speech:get-voices',
  SPEECH_RECOGNIZE_START: 'speech:recognize-start',
  SPEECH_RECOGNIZE_STOP: 'speech:recognize-stop',

  // Realtime channels
  REALTIME_TASK_REQUESTED: 'realtime:task-requested',
  REALTIME_TASK_RESULT: 'realtime:task-result',

  // Task channels
  TASK_GET_STATUS: 'task:get-status',
  TASK_GET_EVENTS: 'task:get-events',
  TASK_STREAM_EVENTS: 'task:stream-events',
  TASK_STREAM_EVENT: 'task:stream-event',

  // Settings channels
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update'
} as const

export type IpcChannels = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
