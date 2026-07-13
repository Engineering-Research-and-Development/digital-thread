import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Clock,
  Upload,
  AlertTriangle,
  RotateCcw,
  Play,
  Hand,
  CheckCircle,
  Search,
  X,
  ChevronDown,
} from 'lucide-react'
import type { TimelineEvent } from '@/types/state-machine'
import { getPartnerColor } from '@/lib/partner-utils'
import { cn } from '@/lib/utils'

interface IterationTimelineProps {
  events: TimelineEvent[]
}

const ACTION_ICONS: Record<string, typeof Clock> = {
  'File Uploaded': Upload,
  'Action Claimed': Hand,
  'Auto Completed': CheckCircle,
  'Defect Found': AlertTriangle,
  'Iteration Restarted': RotateCcw,
  'Iteration Created': Play,
  'Retry Triggered': RotateCcw,
  'Auto Execution': Play,
}

const ACTION_COLORS: Record<string, string> = {
  'File Uploaded': 'text-emerald-400',
  'Action Claimed': 'text-amber-400',
  'Auto Completed': 'text-emerald-400',
  'Defect Found': 'text-red-400',
  'Iteration Restarted': 'text-amber-400',
  'Iteration Created': 'text-blue-400',
  'Retry Triggered': 'text-amber-400',
  'Auto Execution': 'text-blue-400',
}

export function IterationTimeline({ events }: IterationTimelineProps) {
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }, [events])

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sortedEvents
    return sortedEvents.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        e.partner.toLowerCase().includes(q) ||
        e.nodeLabel?.toLowerCase().includes(q) ||
        e.filePath?.toLowerCase().includes(q)
    )
  }, [sortedEvents, query])

  // Auto-scroll to latest when new events arrive (if enabled and no filter)
  useEffect(() => {
    if (!autoScroll || query) return
    const el = scrollRef.current?.querySelector<HTMLDivElement>('[data-scroll-viewport]')
    if (el) el.scrollTop = el.scrollHeight
  }, [filteredEvents.length, autoScroll, query])

  const scrollToBottom = () => {
    const el = scrollRef.current?.querySelector<HTMLDivElement>('[data-scroll-viewport]')
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setAutoScroll(true)
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/30 relative">
      <div className="px-3 py-2.5 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Timeline
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {query ? `${filteredEvents.length} of ${sortedEvents.length}` : `${sortedEvents.length} event${sortedEvents.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events..."
            className="h-7 pl-6 pr-7 text-[11px]"
            aria-label="Search timeline events"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea
        ref={scrollRef}
        className="flex-1"
        onScroll={(e) => {
          const target = e.currentTarget.querySelector<HTMLDivElement>('[data-scroll-viewport]')
          if (!target) return
          const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 40
          if (atBottom !== autoScroll) setAutoScroll(atBottom)
        }}
      >
        <div className="relative px-4 py-3">
          {/* Vertical line */}
          <div className="absolute left-[27px] top-0 bottom-0 w-px bg-border" aria-hidden="true" />

          <div className="space-y-4">
            {filteredEvents.map((event) => {
              const Icon = ACTION_ICONS[event.action] || Clock
              const iconColorClass = ACTION_COLORS[event.action] || 'text-muted-foreground'
              const partnerColor = getPartnerColor(event.partner)

              return (
                <div key={event.id} className="relative flex gap-3">
                  {/* Icon dot */}
                  <div className="relative z-10 flex items-center justify-center w-4 h-4 rounded-full bg-card border border-border shrink-0 mt-0.5">
                    <Icon className={cn('h-2.5 w-2.5', iconColorClass)} aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${partnerColor}15`, color: partnerColor }}
                      >
                        {event.partner}
                      </span>
                      <span className="text-[11px] font-semibold text-foreground/90">
                        {event.action}
                      </span>
                    </div>
                    {event.detail && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {event.detail}
                      </p>
                    )}
                    {event.filePath && (
                      <p
                        className="text-[10px] font-mono text-muted-foreground/70 mt-0.5 truncate"
                        title={event.filePath}
                      >
                        {event.filePath}
                      </p>
                    )}
                    <p
                      className="text-[10px] text-muted-foreground/60 mt-1 tabular-nums"
                      title={new Date(event.timestamp).toLocaleString()}
                    >
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )
            })}

            {sortedEvents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-6 w-6 mx-auto mb-2 opacity-40" aria-hidden="true" />
                <p className="text-[11px] italic">No events recorded yet</p>
                <p className="text-[10px] mt-1">Events will appear as the iteration progresses</p>
              </div>
            )}

            {sortedEvents.length > 0 && filteredEvents.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Search className="h-5 w-5 mx-auto mb-2 opacity-40" aria-hidden="true" />
                <p className="text-[11px]">No events match "{query}"</p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-[10px] text-blue-400 hover:text-blue-300 mt-1"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Scroll to bottom button (appears when user scrolled up) */}
      {!autoScroll && !query && filteredEvents.length > 3 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-semibold px-2.5 py-1 shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          aria-label="Scroll to latest event"
        >
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
          Latest
        </button>
      )}
    </div>
  )
}
