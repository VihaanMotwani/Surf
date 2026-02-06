/// <reference types="vite/client" />

import { ElectronAPI } from '../preload'

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
