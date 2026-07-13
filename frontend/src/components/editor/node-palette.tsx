import { useEffect, useMemo } from 'react'
import { GENERIC_PALETTE } from '@/data/node-catalog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { getIcon } from '@/lib/icons'
import { ArrowDownToLine, ArrowUpFromLine, Sparkles, Shapes } from 'lucide-react'
import { useNodeTemplateStore } from '@/stores/node-template-store'
import { usePartnerStore } from '@/stores/partner-store'
import { WipOverlay } from '@/components/common/wip-overlay'
import type { DragEvent } from 'react'

/**
 * Palette with two sections:
 *
 * 1. **Generic** (`Trigger / Task / Gateway / Storage`) - blank nodes, hardcoded
 *    in `GENERIC_PALETTE` (frontend constant). Everything is configured by
 *    the partner in the right-side panel.
 * 2. **Domain templates** - DB-backed entries managed by SUPERADMIN/OWNER via
 *    /settings → Node templates. The store fetches them at mount; the
 *    palette shows the enabled ones (sorted by `sortOrder`).
 *
 * Drag payloads:
 *   - generic   → `application/reactflow-nodekind`  = NodeKind string
 *   - template  → `application/reactflow-template-id` = NodeTemplate.id
 */
export function NodePalette() {
  const templates = useNodeTemplateStore((s) => s.templates)
  const initTemplates = useNodeTemplateStore((s) => s.init)
  const partners = usePartnerStore((s) => s.partners)

  useEffect(() => { initTemplates() }, [initTemplates])

  const enabledTemplates = useMemo(
    () => templates.filter((t) => t.enabled).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    [templates],
  )

  const onDragStartGeneric = (event: DragEvent, kind: string) => {
    event.dataTransfer.setData('application/reactflow-nodekind', kind)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragStartTemplate = (event: DragEvent, id: string) => {
    event.dataTransfer.setData('application/reactflow-template-id', id)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-60 border-r border-border bg-card/50 flex flex-col">
      <div className="px-3 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Node Palette
        </h3>
        <p className="text-[10px] text-muted-foreground/80 mt-1 leading-tight">
          Drag onto the canvas. Templates land pre-configured; generics are
          blank and characterised in the right panel.
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {/* ─── Generic ────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <Shapes className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Generic
              </p>
            </div>
            <div className="space-y-1">
              {GENERIC_PALETTE.map((entry) => {
                const LucideIcon = getIcon(entry.icon)
                return (
                  <div
                    key={entry.kind}
                    className="flex items-start gap-2 px-2 py-2 rounded-md cursor-grab hover:bg-accent transition-colors border border-dashed border-border/40"
                    draggable
                    onDragStart={(e) => onDragStartGeneric(e, entry.kind)}
                    title={entry.description}
                  >
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                    {LucideIcon && <LucideIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: entry.color }} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{entry.label}</p>
                      <p className="text-[9px] text-muted-foreground/80 line-clamp-2 leading-tight">
                        {entry.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <Separator />

          {/* ─── Domain templates (DB-backed) — WORK IN PROGRESS ────────── */}
          <WipOverlay variant="section">
            <section>
            <div className="flex items-center justify-between px-1 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-amber-400" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                  Domain templates
                </p>
              </div>
              <a
                href="/settings"
                className="text-[9px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                title="Manage templates"
              >
                Manage…
              </a>
            </div>
            <p className="text-[9px] text-muted-foreground/70 px-1 leading-tight mb-1.5">
              Pre-wired with inputs, outputs and file types. Drop and customise.
            </p>
            {enabledTemplates.length === 0 ? (
              <p className="text-[10px] italic text-muted-foreground px-1">
                No templates yet. Add some in Settings → Node templates.
              </p>
            ) : (
              <div className="space-y-1">
                {enabledTemplates.map((entry) => {
                  const LucideIcon = getIcon(entry.icon)
                  const partner = entry.defaultPartnerId ? partners[entry.defaultPartnerId] : undefined
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 px-2 py-2 rounded-md cursor-grab hover:bg-accent transition-colors border border-amber-500/20 bg-amber-500/5"
                      draggable
                      onDragStart={(e) => onDragStartTemplate(e, entry.id)}
                      title={entry.description}
                    >
                      <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      {LucideIcon && <LucideIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: entry.color }} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{entry.label}</p>
                        <p className="text-[9px] text-muted-foreground/80 line-clamp-2 leading-tight">
                          {entry.description}
                        </p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {entry.inputs.length > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[8px] rounded bg-blue-500/15 text-blue-300 px-1 py-0.5"
                              title={`${entry.inputs.length} input(s) pre-defined`}
                            >
                              <ArrowDownToLine className="h-2.5 w-2.5" /> {entry.inputs.length}
                            </span>
                          )}
                          {entry.outputs.length > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[8px] rounded bg-emerald-500/15 text-emerald-300 px-1 py-0.5"
                              title={`${entry.outputs.length} output(s) pre-defined`}
                            >
                              <ArrowUpFromLine className="h-2.5 w-2.5" /> {entry.outputs.length}
                            </span>
                          )}
                          {partner && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 leading-none">
                              {partner.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          </WipOverlay>
        </div>
      </ScrollArea>
    </div>
  )
}
