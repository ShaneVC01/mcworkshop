import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const KEY = 'mcw-install-dismissed'

function dismissed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Offers to install the app. Chrome and Edge fire beforeinstallprompt.
 * iOS Safari has no prompt, so we explain Add to Home Screen instead.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(dismissed)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (hidden || standalone || (!event && !ios)) return null

  const close = () => {
    setHidden(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // Shown again next visit.
    }
  }

  return (
    <div className="flex items-center gap-3 border-b bg-accent px-4 py-2 text-accent-foreground">
      {event ? (
        <>
          <p className="min-w-0 flex-1 text-sm font-medium">Install the workshop app on this device for one tap access.</p>
          <Button
            className="shrink-0"
            onClick={async () => {
              await event.prompt()
              await event.userChoice
              setEvent(null)
            }}
          >
            <Download aria-hidden="true" />
            Install
          </Button>
        </>
      ) : (
        <p className="min-w-0 flex-1 text-sm font-medium">
          To install on this device, tap <Share className="inline size-4" aria-label="Share" /> then Add to Home Screen.
        </p>
      )}
      <button type="button" onClick={close} aria-label="Dismiss" className="flex size-touch shrink-0 items-center justify-center">
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
