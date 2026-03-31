/**
 * @module components/TurnstileWidget
 * @description Cloudflare Turnstile CAPTCHA widget.
 * Renders invisible/managed challenge. Calls onVerify with the token.
 * If TI_TURNSTILE_SITE_KEY is not set, renders nothing (dev mode).
 */
import { useEffect, useRef, useCallback } from 'react'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

let scriptLoaded = false

export function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: onVerify,
      'expired-callback': onExpire,
      theme: 'dark',
      size: 'flexible',
    })
  }, [onVerify, onExpire])

  useEffect(() => {
    if (!SITE_KEY) return

    if (window.turnstile) {
      renderWidget()
      return
    }

    if (!scriptLoaded) {
      scriptLoaded = true
      window.onTurnstileLoad = renderWidget
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
      script.async = true
      document.head.appendChild(script)
    } else {
      window.onTurnstileLoad = renderWidget
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [renderWidget])

  if (!SITE_KEY) return null

  return <div ref={containerRef} className="mt-2" />
}
