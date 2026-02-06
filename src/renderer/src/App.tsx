import { useEffect } from 'react'
import { MainLayout } from '@/components/Layout/MainLayout'
import { Toaster } from '@/components/ui/toaster'
import { useAccessibility } from '@/hooks/useAccessibility'
import { useSettingsStore } from '@/store/settings'
import { useIPC } from '@/hooks/useIPC'

export default function App() {
  const electron = useIPC()
  const { updateSettings } = useSettingsStore()

  // Initialize accessibility settings
  useAccessibility()

  // Load settings from backend
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await electron.getSettings()
        updateSettings(settings as any)
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }

    loadSettings()
  }, [electron, updateSettings])

  return (
    <>
      <MainLayout />
      <Toaster />
    </>
  )
}
