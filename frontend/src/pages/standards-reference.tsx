import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/sonner'

type Fmt = 'aas' | 'dtdl' | 'aml'

const FORMAT_LABEL: Record<Fmt, string> = {
  aas: 'AAS (IEC 63278)',
  dtdl: 'DTDL v3',
  aml: 'AutomationML (IEC 62714)',
}

function isFmt(s: string | undefined): s is Fmt {
  return s === 'aas' || s === 'dtdl' || s === 'aml'
}

export function StandardsReference() {
  const { format } = useParams<{ format: string }>()
  const navigate = useNavigate()
  const fmt = isFmt(format) ? format : null

  const [md, setMd] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!fmt) {
      setError(`Unknown format "${format}".`)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    api.standards.getReferenceMarkdown(fmt)
      .then((text) => { if (alive) { setMd(text); setLoading(false) } })
      .catch((e: any) => { if (alive) { setError(e?.message ?? 'Unknown error'); setLoading(false) } })
    return () => { alive = false }
  }, [fmt, format])

  const handleDownloadExample = async () => {
    if (!fmt) return
    setDownloading(true)
    try {
      await api.standards.downloadExample(fmt)
      toast.success(`Example ${fmt.toUpperCase()} downloaded`)
    } catch (e: any) {
      toast.error(`Download failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setDownloading(false)
    }
  }

  const title = fmt ? `Reference · ${FORMAT_LABEL[fmt]}` : 'Reference'

  return (
    <>
      <TopBar
        title={title}
        subtitle="Mapping, annotated example, validation rules and common errors"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/docs/standards')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to standards
            </Button>
            {fmt && (
              <Button size="sm" onClick={handleDownloadExample} disabled={downloading}>
                {downloading
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <Download className="h-4 w-4 mr-1" />}
                Download example
              </Button>
            )}
          </div>
        }
      />
      <div className="p-6 max-w-4xl">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reference…
          </div>
        )}
        {error && !loading && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            Could not load reference: {error}
            <div className="mt-2">
              <Link to="/docs/standards" className="underline text-blue-400 hover:text-blue-300">
                ← Back to standards
              </Link>
            </div>
          </div>
        )}
        {!loading && !error && md && <MarkdownView source={md} />}
      </div>
    </>
  )
}

function MarkdownView({ source }: { source: string }) {
  // Render markdown with GFM (tables, strikethrough, etc.) and dark-theme
  // styling driven by Tailwind. We override individual nodes instead of
  // depending on @tailwindcss/typography so the look matches the rest of
  // the app (compact, mono code, blue accent links).
  const components = useMemo(() => ({
    h1: (props: any) => <h1 className="text-2xl font-semibold mt-2 mb-4 pb-2 border-b border-border" {...props} />,
    h2: (props: any) => <h2 className="text-xl font-semibold mt-8 mb-3 pb-1 border-b border-border/60" {...props} />,
    h3: (props: any) => <h3 className="text-base font-semibold mt-6 mb-2" {...props} />,
    h4: (props: any) => <h4 className="text-sm font-semibold mt-4 mb-2 uppercase tracking-wider text-muted-foreground" {...props} />,
    p: (props: any) => <p className="text-sm leading-relaxed my-3" {...props} />,
    ul: (props: any) => <ul className="list-disc list-outside ml-5 my-3 space-y-1 text-sm" {...props} />,
    ol: (props: any) => <ol className="list-decimal list-outside ml-5 my-3 space-y-1 text-sm" {...props} />,
    li: (props: any) => <li className="leading-relaxed" {...props} />,
    a: (props: any) => (
      <a
        className="text-blue-400 hover:text-blue-300 underline"
        target={props.href?.startsWith('http') ? '_blank' : undefined}
        rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        {...props}
      />
    ),
    hr: () => <hr className="my-6 border-border" />,
    blockquote: (props: any) => (
      <blockquote className="border-l-2 border-blue-500/50 pl-3 my-3 text-sm text-muted-foreground italic" {...props} />
    ),
    strong: (props: any) => <strong className="font-semibold text-foreground" {...props} />,
    em: (props: any) => <em className="italic" {...props} />,
    code: ({ inline, className, children, ...rest }: any) => {
      if (inline) {
        return (
          <code
            className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[12px] text-foreground"
            {...rest}
          >
            {children}
          </code>
        )
      }
      return (
        <code className={`font-mono text-[12px] ${className ?? ''}`} {...rest}>
          {children}
        </code>
      )
    },
    pre: (props: any) => (
      <pre
        className="rounded-md border border-border bg-muted/40 p-3 overflow-x-auto my-4 text-[12px] leading-relaxed"
        {...props}
      />
    ),
    table: (props: any) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full text-xs border-collapse" {...props} />
      </div>
    ),
    thead: (props: any) => <thead className="bg-muted/40" {...props} />,
    th: (props: any) => (
      <th className="border border-border/60 px-2 py-1.5 text-left font-medium" {...props} />
    ),
    td: (props: any) => (
      <td className="border border-border/60 px-2 py-1.5 align-top" {...props} />
    ),
  }), [])

  return (
    <article>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </article>
  )
}
