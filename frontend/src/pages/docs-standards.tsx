import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, FileText, BookOpen, Loader2, Upload } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { WipOverlay } from '@/components/common/wip-overlay'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/sonner'

type Fmt = 'aas' | 'dtdl' | 'aml'

interface StandardDoc {
  format: Fmt
  name: string
  shortName: string
  standardRef: string
  fileExt: string
  /** 3–5 line synopsis: what the standard is + how it maps to a state machine. */
  synopsis: string
  /** Key (model element → digital-thread concept) pairs. Max ~4 rows. */
  mapping: Array<{ from: string; to: string }>
}

const STANDARDS: StandardDoc[] = [
  {
    format: 'aas',
    name: 'Asset Administration Shell',
    shortName: 'AAS',
    standardRef: 'IEC 63278 · AAS v3 JSON',
    fileExt: '.aas.json',
    synopsis:
      "ISO/IEC standard for representing an industrial asset as a self-describing digital object made of reusable submodels. A state machine becomes an AAS Shell of kind 'Type' whose Submodel 'WorkflowDefinition' contains one SubmodelElementCollection per node and one AnnotatedRelationship per edge. Each iteration is exported as a Shell of kind 'Instance' that bundles the runtime submodels (TechnicalData, ProvenanceLog, WorkflowExecution, …).",
    mapping: [
      { from: 'AssetAdministrationShell (assetKind=Type)', to: 'StateMachine' },
      { from: 'Submodel "WorkflowDefinition"', to: 'Workflow graph' },
      { from: 'SubmodelElementCollection (kind/inputs/outputs)', to: 'FlowNodeDef' },
      { from: 'AnnotatedRelationship', to: 'FlowEdgeDef' },
    ],
  },
  {
    format: 'dtdl',
    name: 'Digital Twins Definition Language',
    shortName: 'DTDL',
    standardRef: 'DTDL v3 · JSON-LD',
    fileExt: '.dtdl.json',
    synopsis:
      "Microsoft / Azure open spec for defining Digital Twin interfaces - properties, telemetry, commands and relationships. A state machine is a root Interface that contains one Component per node (its `schema` points to the Interface of the node type, where category/telemetry/commands are declared), a Relationship 'flowsTo' that describes edges, and a Property 'edgesJson' whose `comment` field serializes the edge list (DTDL has no native link-list concept).",
    mapping: [
      { from: 'Interface (workflow root)', to: 'StateMachine' },
      { from: 'Component (in workflow Interface)', to: 'FlowNodeDef' },
      { from: 'Interface referenced by Component', to: 'Node type (kind + telemetry)' },
      { from: 'Relationship "flowsTo" + Property edgesJson', to: 'FlowEdgeDef' },
    ],
  },
  // {
  //   format: 'aml',
  //   name: 'AutomationML (CAEX)',
  //   shortName: 'AML',
  //   standardRef: 'IEC 62714 · CAEX 3.0 XML',
  //   fileExt: '.aml',
  //   synopsis:
  //     "IEC standard for exchanging industrial engineering data, based on CAEX XML. A state machine is a CAEXFile with a SystemUnitClassLib where each node is a SystemUnitClass carrying RoleRequirements toward `DigitalThreadRoles/{TRIGGER | AUTOMATIC | MANUAL | GATEWAY | STORAGE }`; an InstanceHierarchy gathers the InternalElement entries (X/Y canvas positions) and the InternalLink entries (edges). Input/output ports are ExternalInterface elements with a `fileTypes` whitelist.",
  //   mapping: [
  //     { from: 'SystemUnitClass + RoleRequirements', to: 'FlowNodeDef (type definition)' },
  //     { from: 'ExternalInterface (FileInput/FileOutput)', to: 'NodeInputDef / NodeOutputDef' },
  //     { from: 'InstanceHierarchy/InternalElement', to: 'Layout (positionX/Y)' },
  //     { from: 'InternalLink', to: 'FlowEdgeDef' },
  //   ],
  // },
]

export function DocsStandards() {
  return (
    <WipOverlay>
      <TopBar
        title="Standards documentation"
        subtitle="AAS and DTDL - supported formats for state-machine import and export"
      />
      <div className="p-6 max-w-6xl">
        <Card className="mb-6 border-border bg-muted/20">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm">
              Digital Thread can <strong>import</strong> and <strong>export</strong> every state machine
              in three industrial formats: <strong>AAS</strong> (IEC 63278) and <strong>DTDL</strong> v3. Export lives in the graphical editor toolbar;
              import is the <em>Import</em> button on the{' '}
              <Link to="/machines" className="underline text-blue-400 hover:text-blue-300">State Machines</Link>
              {' '}page.
            </p>
            <p className="text-xs text-muted-foreground">
              For each format you can download a <strong>real example</strong> - re-exported on the fly
              from the seeded <code className="mx-1 text-[11px]">sm-uc-manual-upload</code> machine,
              so it is always in sync with the current exporter - and open the <strong>full reference</strong>
              {' '}with its mapping table, annotated example, validation rules and common errors.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {STANDARDS.map((s) => (
            <StandardCard key={s.format} doc={s} />
          ))}
        </div>

        <Card className="mt-6 border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" /> How import works
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>
              1. Open <Link to="/machines" className="underline text-blue-400 hover:text-blue-300">State Machines</Link>
              {' '}and click <em>Import</em>.
            </p>
            <p>2. Pick a format (AAS, DTDL or AML), select the file and confirm.</p>
            <p>
              3. The backend <strong>validates</strong> the document (see the &quot;Validation rules&quot;
              section in the format reference) and creates a new state machine. If validation fails,
              the machine is not created and the error is shown in a toast with a code (e.g.{' '}
              <code className="text-[10px]">AAS_MISSING_WORKFLOW_SUBMODEL</code>).
            </p>
            <p>
              4. Import is the symmetric inverse of export - a file downloaded via <em>Download example</em>
              {' '}above round-trips back through import with no data loss.
            </p>
          </CardContent>
        </Card>
      </div>
    </WipOverlay>
  )
}

function StandardCard({ doc }: { doc: StandardDoc }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const handleDownload = async () => {
    setBusy(true)
    try {
      await api.standards.downloadExample(doc.format)
      toast.success(`Example ${doc.shortName} downloaded`)
    } catch (e: any) {
      toast.error(`Download failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-border flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-blue-400" />
              {doc.shortName}
            </CardTitle>
            <CardDescription className="text-[11px] mt-0.5">{doc.name}</CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">{doc.fileExt}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
          {doc.standardRef}
        </p>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pb-3">
        <p className="text-xs leading-relaxed">{doc.synopsis}</p>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Main mapping
          </p>
          <div className="rounded-md border border-border/60 divide-y divide-border/60">
            {doc.mapping.map((row, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 px-2 py-1.5 text-[10.5px]">
                <code className="text-muted-foreground truncate" title={row.from}>{row.from}</code>
                <span className="font-medium truncate" title={row.to}>→ {row.to}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0 flex flex-col gap-2 items-stretch">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center"
          onClick={handleDownload}
          disabled={busy}
        >
          {busy
            ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            : <Download className="h-3 w-3 mr-1" />}
          Download example
        </Button>
        <Button
          variant="default"
          size="sm"
          className="w-full justify-center"
          onClick={() => navigate(`/docs/standards/${doc.format}`)}
        >
          <FileText className="h-3 w-3 mr-1" />
          Open reference
        </Button>
      </CardFooter>
    </Card>
  )
}
