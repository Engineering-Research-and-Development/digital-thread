import { Construction } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WipOverlayProps {
  children: React.ReactNode
  /** Overlay label. Defaults to "Work in progress". */
  label?: string
  /** Extra classes for the outer wrapper. */
  className?: string
  /**
   * 'page' (default): full-page WIP section — the badge sticks to the viewport
   *   top so it stays visible while scrolling a tall page.
   * 'section': embedded region (a settings tab, a profile card) — the badge
   *   overlays the top of the region and scrolls together with it.
   */
  variant?: 'page' | 'section'
}

/**
 * Marks a page (or any region) as Work In Progress: it shows a yellow
 * "Work in progress" badge at the top and renders the wrapped content
 * blurred + fully non-interactive (`inert`, so mouse, keyboard and the
 * a11y tree are all blocked). Frontend-only "coming soon" treatment for
 * sections we want to reveal gradually — no backend/route change.
 */
export function WipOverlay({
  children,
  label = 'Work in progress',
  className,
  variant = 'page',
}: WipOverlayProps) {
  const badge = (
    <div className="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border border-yellow-600/50 bg-yellow-400 px-4 py-1.5 text-sm font-semibold text-yellow-950 shadow-lg shadow-black/25">
      <Construction className="h-4 w-4" aria-hidden="true" />
      {label}
    </div>
  )

  return (
    <div className={cn('relative flex flex-1 flex-col min-h-0', className)}>
      {variant === 'page' ? (
        // Zero-height sticky layer: the badge rides along at the viewport top
        // on scroll without pushing the (blurred) content down.
        <div className="pointer-events-none sticky top-0 z-30 flex h-0 justify-center overflow-visible">
          <div className="mt-3">{badge}</div>
        </div>
      ) : (
        // Absolute overlay pinned to the top of this region (scrolls with it).
        <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center">
          {badge}
        </div>
      )}

      {/* Hidden content — blurred, dimmed and inert (no pointer/keyboard/a11y).
          In 'section' mode we reserve top padding so the badge sits above it. */}
      <div
        inert
        className={cn(
          'pointer-events-none select-none blur-sm opacity-50 flex flex-1 flex-col min-h-0',
          variant === 'section' && 'pt-12',
        )}
      >
        {children}
      </div>
    </div>
  )
}
