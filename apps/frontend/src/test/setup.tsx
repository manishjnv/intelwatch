import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Mock framer-motion for jsdom compatibility
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        // Return a forwardRef component that renders the HTML element
        return ({
          children,
          className,
          style,
          onClick,
          onMouseMove,
          onMouseLeave,
          ...rest
        }: Record<string, unknown>) => {
          const dataProps: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(rest)) {
            if (k.startsWith('data-')) dataProps[k] = v
          }
          const El = prop as keyof JSX.IntrinsicElements
          return (
            <El
              className={className as string}
              style={style as React.CSSProperties}
              onClick={onClick as React.MouseEventHandler}
              onMouseMove={onMouseMove as React.MouseEventHandler}
              onMouseLeave={onMouseLeave as React.MouseEventHandler}
              {...dataProps}
            >
              {children as React.ReactNode}
            </El>
          )
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useTransform: () => ({ set: vi.fn(), get: () => 0 }),
  useSpring: () => ({ set: vi.fn(), get: () => 0 }),
}))

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
