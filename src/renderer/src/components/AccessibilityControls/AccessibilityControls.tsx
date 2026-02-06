import { Sun, Moon, Type, Volume2, Contrast } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import * as Popover from '@radix-ui/react-popover'
import { useSettingsStore } from '@/store/settings'
import { useIPC } from '@/hooks/useIPC'
import { useSpeech } from '@/hooks/useSpeech'

export function AccessibilityControls() {
  const settings = useSettingsStore()
  const electron = useIPC()
  const { voices: _voices } = useSpeech()

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
              <h3 className="font-medium">Speech Settings</h3>

              <div>
                <label htmlFor="speech-rate" className="text-sm mb-2 block">
                  Speed
                </label>
                <div className="flex items-center space-x-4">
                  <Slider
                    id="speech-rate"
                    value={[settings.speechRate]}
                    onValueChange={([value]) => updateSettings({ speechRate: value })}
                    min={0.5}
                    max={2}
                    step={0.1}
                    aria-label="Speech rate"
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {settings.speechRate.toFixed(1)}x
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="speech-pitch" className="text-sm mb-2 block">
                  Pitch
                </label>
                <div className="flex items-center space-x-4">
                  <Slider
                    id="speech-pitch"
                    value={[settings.speechPitch]}
                    onValueChange={([value]) => updateSettings({ speechPitch: value })}
                    min={0.5}
                    max={2}
                    step={0.1}
                    aria-label="Speech pitch"
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {settings.speechPitch.toFixed(1)}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="speech-volume" className="text-sm mb-2 block">
                  Volume
                </label>
                <div className="flex items-center space-x-4">
                  <Slider
                    id="speech-volume"
                    value={[settings.speechVolume]}
                    onValueChange={([value]) => updateSettings({ speechVolume: value })}
                    min={0}
                    max={1}
                    step={0.1}
                    aria-label="Speech volume"
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">
                    {Math.round(settings.speechVolume * 100)}%
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
