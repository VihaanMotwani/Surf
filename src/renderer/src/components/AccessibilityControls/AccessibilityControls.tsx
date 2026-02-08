import { Sun, Moon, Type, Volume2, Contrast } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import * as Popover from '@radix-ui/react-popover'
import { useSettingsStore } from '@/store/settings'
import { useIPC } from '@/hooks/useIPC'
import { OPENAI_VOICES } from '@/hooks/useSpeech'

export function AccessibilityControls() {
  const settings = useSettingsStore()
  const electron = useIPC()

  const updateSettings = async (updates: Partial<typeof settings>) => {
    settings.updateSettings(updates)
    await electron.updateSettings(updates)
  }

  const cycleTheme = () => {
    const themes = ['light', 'dark', 'high-contrast'] as const
    const currentIndex = themes.indexOf(settings.theme)
    const nextTheme = themes[(currentIndex + 1) % themes.length]
    updateSettings({ theme: nextTheme })
  }

  const getThemeIcon = () => {
    switch (settings.theme) {
      case 'dark':
        return <Moon className="h-5 w-5" />
      case 'high-contrast':
        return <Contrast className="h-5 w-5" />
      default:
        return <Sun className="h-5 w-5" />
    }
  }

  return (
    <div className="flex items-center space-x-2" role="toolbar" aria-label="Accessibility controls">
      {/* Theme Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={cycleTheme}
        aria-label={`Current theme: ${settings.theme}. Click to change theme`}
      >
        {getThemeIcon()}
      </Button>

      {/* Text Scale */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Adjust text size"
          >
            <Type className="h-5 w-5" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none"
            sideOffset={5}
            align="end"
          >
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">Text Size</h3>
                <div className="flex items-center space-x-4">
                  <Slider
                    value={[settings.textScale]}
                    onValueChange={([value]) => updateSettings({ textScale: value })}
                    min={0.8}
                    max={2}
                    step={0.1}
                    aria-label="Text size scale"
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {Math.round(settings.textScale * 100)}%
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <label htmlFor="reduced-motion" className="text-sm font-medium">
                  Reduce Motion
                </label>
                <Switch
                  id="reduced-motion"
                  checked={settings.reducedMotion}
                  onCheckedChange={(checked) => updateSettings({ reducedMotion: checked })}
                  aria-describedby="reduced-motion-desc"
                />
              </div>
              <p id="reduced-motion-desc" className="text-xs text-muted-foreground">
                Minimize animations for motion sensitivity
              </p>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Speech Controls */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Adjust speech settings"
          >
            <Volume2 className="h-5 w-5" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none"
            sideOffset={5}
            align="end"
          >
            <div className="space-y-4">
              <h3 className="font-medium">Voice Settings</h3>

              <div>
                <label htmlFor="voice-select" className="text-sm mb-2 block">
                  Voice (Realtime)
                </label>
                <select
                  id="voice-select"
                  value={settings.selectedVoice}
                  onChange={(e) => updateSettings({ selectedVoice: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {OPENAI_VOICES.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} - {voice.description}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Change applies to new chats. Start a new chat to hear the new voice.
                </p>
              </div>

              <Separator />
              <p className="text-xs text-muted-foreground">Legacy playback settings (for older messages)</p>

              <div>
                <label htmlFor="tts-model" className="text-sm mb-2 block">
                  Quality
                </label>
                <select
                  id="tts-model"
                  value={settings.ttsModel}
                  onChange={(e) => updateSettings({ ttsModel: e.target.value as 'tts-1' | 'tts-1-hd' })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="tts-1">Standard (faster)</option>
                  <option value="tts-1-hd">HD (higher quality)</option>
                </select>
              </div>

              <div>
                <label htmlFor="speech-speed" className="text-sm mb-2 block">
                  Speed
                </label>
                <div className="flex items-center space-x-4">
                  <Slider
                    id="speech-speed"
                    value={[settings.speechSpeed]}
                    onValueChange={([value]) => updateSettings({ speechSpeed: value })}
                    min={0.25}
                    max={4}
                    step={0.25}
                    aria-label="Speech speed"
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {settings.speechSpeed.toFixed(2)}x
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <label htmlFor="auto-speak" className="text-sm font-medium">
                  Auto-speak responses
                </label>
                <Switch
                  id="auto-speak"
                  checked={settings.autoSpeak}
                  onCheckedChange={(checked) => updateSettings({ autoSpeak: checked })}
                />
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
