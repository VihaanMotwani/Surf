import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settings'

export function useAccessibility() {
  const settings = useSettingsStore()

  // Apply theme
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'high-contrast')
    root.classList.add(settings.theme)
  }, [settings.theme])

  // Apply text scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${settings.textScale * 100}%`
  }, [settings.textScale])

  // Apply reduced motion preference
  useEffect(() => {
    if (settings.reducedMotion) {
      document.documentElement.style.setProperty('--animation-duration', '0.01ms')
    } else {
      document.documentElement.style.removeProperty('--animation-duration')
    }
  }, [settings.reducedMotion])

  return settings
}

// Hook for announcing to screen readers
export function useScreenReaderAnnounce() {
  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div')
    announcement.setAttribute('role', 'status')
    announcement.setAttribute('aria-live', priority)
    announcement.setAttribute('aria-atomic', 'true')
    announcement.className = 'sr-only'
    announcement.textContent = message

    document.body.appendChild(announcement)

    setTimeout(() => {
      document.body.removeChild(announcement)
    }, 1000)
  }

  return { announce }
}

// Hook for managing focus
export function useFocusManagement() {
  const trapFocus = (container: HTMLElement) => {
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus()
          e.preventDefault()
        }
      }
    }

    container.addEventListener('keydown', handleTab)

    return () => {
      container.removeEventListener('keydown', handleTab)
    }
  }

  return { trapFocus }
}
