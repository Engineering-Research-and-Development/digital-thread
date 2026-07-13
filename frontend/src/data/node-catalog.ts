import { NodeCategory, NodeKind } from '@/types/enums'

export interface NodeCatalogEntry {
  id: string
  category: NodeCategory
  label: string
  icon: string
  color: string
  description: string
  defaultPartner?: string
  expectedOutput?: string
}

/**
 * Generic palette. The editor surface no longer exposes domain
 * catalogs (CAD/AI/NDI/…). The legacy NODE_CATALOG below is kept only as a
 * fallback lookup table for icon/colour of nodes saved before the generic
 * node model migration — readers must tolerate cache-miss (the new generic
 * palette uses the entries here only).
 */
export interface GenericPaletteEntry {
  /** Kind acts as both the drag payload and the canonical NodeKind value. */
  kind: NodeKind
  label: string
  icon: string
  color: string
  description: string
}

export const GENERIC_PALETTE: GenericPaletteEntry[] = [
  {
    kind: NodeKind.TRIGGER,
    label: 'Trigger',
    icon: 'Zap',
    color: '#10B981',
    description: 'Pipeline entry point — fires the workflow when an event occurs.',
  },
  {
    kind: NodeKind.TASK,
    label: 'Task',
    icon: 'Box',
    color: '#3B82F6',
    description: 'Work performed by a partner. Configure inputs/outputs and the file-type whitelist.',
  },
  {
    kind: NodeKind.GATEWAY,
    label: 'Gateway',
    icon: 'GitMerge',
    color: '#F59E0B',
    description: 'Conditional node — AND/OR over received inputs; forwards them to successors.',
  },
]

/**
 * Domain palette. Curated templates with concrete I/O contracts.
 * Dropping one onto the canvas creates a node *pre-configured* with name,
 * description, inputs[] and outputs[]. The partner can still edit everything.
 *
 * Drag payload: `application/reactflow-domain-id` carries the entry `id`.
 */
export interface DomainTemplateInput {
  id: string
  name: string
  /** Source kind. PREDECESSOR templates leave `from` empty — the
   * partner picks it via the predecessor dropdown after wiring an edge. */
  source: 'MANUAL' | 'PREDECESSOR' | 'DATASOURCE'
  required: boolean
  fileTypes: string[]
  cardinality?: 'ONE' | 'MANY'
  description?: string
}

export interface DomainTemplateOutput {
  id: string
  name: string
  required: boolean
  fileTypes: string[]
  cardinality?: 'ONE' | 'MANY'
  description?: string
}

export interface DomainPaletteEntry {
  id: string
  /** All domain templates collapse to TASK kind. Triggers/gateways/storage
   * have no domain semantics worth a template — leave them generic. */
  kind: typeof NodeKind.TASK
  label: string
  icon: string
  color: string
  description: string
  tags: string[]
  defaultPartner?: string
  inputs: DomainTemplateInput[]
  outputs: DomainTemplateOutput[]
}

const CAD_EXTENSIONS = ['.step', '.stp', '.iges', '.igs', '.catpart', '.x_t']

export const DOMAIN_PALETTE: DomainPaletteEntry[] = [
  {
    id: 'design.cad-release',
    kind: NodeKind.TASK,
    label: 'CAD Release',
    icon: 'PenTool',
    color: '#3B82F6',
    description: 'Release of geometric design files to the consortium.',
    tags: ['design', 'cad'],
    defaultPartner: 'CAI',
    inputs: [
      {
        id: 'requirements',
        name: 'Requirements doc',
        source: 'MANUAL',
        required: false,
        fileTypes: ['.pdf', '.docx'],
        description: 'Optional structural/functional requirements driving the design.',
      },
    ],
    outputs: [
      {
        id: 'cad',
        name: 'Released CAD',
        required: true,
        fileTypes: CAD_EXTENSIONS,
        description: 'STEP / IGES / native CAD file frozen for downstream consumption.',
      },
    ],
  },
  {
    id: 'design.material-spec',
    kind: NodeKind.TASK,
    label: 'Material specification',
    icon: 'FlaskConical',
    color: '#3B82F6',
    description: 'Material card with mechanical, thermal and certification data.',
    tags: ['design', 'materials'],
    defaultPartner: 'AIMPLAS',
    inputs: [],
    outputs: [
      {
        id: 'material-card',
        name: 'Material card',
        required: true,
        fileTypes: ['.json', '.xlsx', '.csv'],
      },
      {
        id: 'datasheet',
        name: 'Datasheet',
        required: false,
        fileTypes: ['.pdf'],
      },
    ],
  },
  {
    id: 'simulation.process',
    kind: NodeKind.TASK,
    label: 'Process simulation',
    icon: 'Cpu',
    color: '#3B82F6',
    description: 'FEA / consolidation / forming simulation on the released geometry.',
    tags: ['simulation'],
    defaultPartner: 'ENS',
    inputs: [
      {
        id: 'cad',
        name: 'Geometry',
        source: 'PREDECESSOR',
        required: true,
        fileTypes: CAD_EXTENSIONS,
      },
      {
        id: 'material',
        name: 'Material card',
        source: 'PREDECESSOR',
        required: true,
        fileTypes: ['.json', '.xlsx'],
      },
    ],
    outputs: [
      {
        id: 'report',
        name: 'Simulation report',
        required: true,
        fileTypes: ['.pdf', '.html'],
      },
      {
        id: 'fields',
        name: 'Result fields',
        required: false,
        fileTypes: ['.vtu', '.h5', '.odb', '.npy'],
        cardinality: 'MANY',
      },
    ],
  },
  {
    id: 'mfg.atl',
    kind: NodeKind.TASK,
    label: 'ATL manufacturing',
    icon: 'Wrench',
    color: '#3B82F6',
    description: 'Automated Tape Laying deposition — physical production with process logs.',
    tags: ['manufacturing'],
    defaultPartner: 'AIM',
    inputs: [
      {
        id: 'cad',
        name: 'Geometry',
        source: 'PREDECESSOR',
        required: true,
        fileTypes: CAD_EXTENSIONS,
      },
      {
        id: 'process-params',
        name: 'Process parameters',
        source: 'PREDECESSOR',
        required: false,
        fileTypes: ['.json', '.csv'],
      },
    ],
    outputs: [
      {
        id: 'process-logs',
        name: 'Process logs',
        required: true,
        fileTypes: ['.csv', '.parquet'],
        cardinality: 'MANY',
      },
      {
        id: 'as-built',
        name: 'As-built report',
        required: false,
        fileTypes: ['.pdf'],
      },
    ],
  },
  {
    id: 'qa.ndi-inspection',
    kind: NodeKind.TASK,
    label: 'NDI inspection',
    icon: 'ScanSearch',
    color: '#3B82F6',
    description: 'Non-destructive inspection (ultrasound / XCT) with raw scans and report.',
    tags: ['quality', 'inspection'],
    defaultPartner: 'IMD',
    inputs: [
      {
        id: 'as-built',
        name: 'As-built artifact',
        source: 'PREDECESSOR',
        required: true,
        fileTypes: ['.pdf', '.csv', '.parquet'],
      },
    ],
    outputs: [
      {
        id: 'scans',
        name: 'Raw scans',
        required: true,
        fileTypes: ['.raw', '.dicom', '.h5'],
        cardinality: 'MANY',
      },
      {
        id: 'report',
        name: 'Inspection report',
        required: true,
        fileTypes: ['.pdf', '.json'],
      },
    ],
  },
  {
    id: 'qa.ai-defect',
    kind: NodeKind.TASK,
    label: 'AI defect detection',
    icon: 'Brain',
    color: '#3B82F6',
    description: 'AI / ML defect mapping over NDI raw scans.',
    tags: ['quality', 'ai'],
    defaultPartner: 'IMD',
    inputs: [
      {
        id: 'scans',
        name: 'NDI scans',
        source: 'PREDECESSOR',
        required: true,
        fileTypes: ['.raw', '.dicom', '.h5'],
        cardinality: 'MANY',
      },
    ],
    outputs: [
      {
        id: 'defect-map',
        name: 'Defect map',
        required: true,
        fileTypes: ['.json', '.npy', '.png'],
      },
    ],
  },
  {
    id: 'lifecycle.aas-publish',
    kind: NodeKind.TASK,
    label: 'AAS publish',
    icon: 'Database',
    color: '#3B82F6',
    description: 'Publish the iteration outputs to the Asset Administration Shell.',
    tags: ['lifecycle', 'aas'],
    defaultPartner: 'UCB',
    inputs: [
      {
        id: 'cad',
        name: 'CAD',
        source: 'PREDECESSOR',
        required: false,
        fileTypes: CAD_EXTENSIONS,
      },
      {
        id: 'reports',
        name: 'Reports',
        source: 'PREDECESSOR',
        required: false,
        fileTypes: ['.pdf', '.json'],
        cardinality: 'MANY',
      },
    ],
    outputs: [
      {
        id: 'aas',
        name: 'AAS package',
        required: true,
        fileTypes: ['.aasx', '.json', '.xml'],
      },
    ],
  },
  {
    id: 'lifecycle.recycling-plan',
    kind: NodeKind.TASK,
    label: 'Recycling plan',
    icon: 'Recycle',
    color: '#3B82F6',
    description: 'End-of-life recycling planning and compliance report.',
    tags: ['lifecycle', 'recycling'],
    defaultPartner: 'AIMPLAS',
    inputs: [
      {
        id: 'aas',
        name: 'AAS package',
        source: 'PREDECESSOR',
        required: true,
        fileTypes: ['.aasx', '.json'],
      },
    ],
    outputs: [
      {
        id: 'plan',
        name: 'Recycling plan',
        required: true,
        fileTypes: ['.pdf', '.docx'],
      },
    ],
  },
]

export const DOMAIN_PALETTE_MAP = Object.fromEntries(DOMAIN_PALETTE.map((e) => [e.id, e]))

export const NODE_CATALOG: NodeCatalogEntry[] = [
  // TRIGGER
  { id: 'CAD_UPLOAD', category: NodeCategory.TRIGGER, label: 'CAD Upload', icon: 'Upload', color: '#3B82F6', description: 'Triggered when a new CAD file is uploaded' },
  { id: 'MATERIAL_CHANGE', category: NodeCategory.TRIGGER, label: 'Material Change', icon: 'RefreshCw', color: '#3B82F6', description: 'Triggered by material specification change' },

  // AUTOMATIC
  { id: 'SIM_CONSOLIDATION', category: NodeCategory.AUTOMATIC, label: 'Sim Consolidation', icon: 'Cpu', color: '#8B5CF6', description: 'Invokes thermoplastic consolidation simulation' },
  { id: 'AI_QUALITY_CHECK', category: NodeCategory.AUTOMATIC, label: 'AI Quality Check', icon: 'Brain', color: '#8B5CF6', description: 'AI analysis of porosity/defect maps' },

  // MANUAL
  { id: 'MFG_ATL', category: NodeCategory.MANUAL, label: 'Manufacturing ATL', icon: 'Wrench', color: '#F59E0B', description: 'Physical tape laying deposition — requires post-production log upload' },
  { id: 'LAB_TEST', category: NodeCategory.MANUAL, label: 'Lab Testing', icon: 'FlaskConical', color: '#F59E0B', description: 'Mechanical or chemical lab tests — requires report upload' },
  { id: 'NDI_INSPECTION', category: NodeCategory.MANUAL, label: 'NDI Inspection', icon: 'ScanSearch', color: '#F59E0B', description: 'Non-destructive inspection (ultrasound/XCT)' },

  // GATEWAY
  { id: 'QUALITY_GATE', category: NodeCategory.GATEWAY, label: 'Quality Gate', icon: 'ShieldCheck', color: '#EF4444', description: 'Binary switch: Pass -> Proceed / Fail -> Return to CAD' },
  { id: 'VERSION_SYNC', category: NodeCategory.GATEWAY, label: 'Version Sync', icon: 'GitMerge', color: '#EF4444', description: 'Waits for all file versions to align before proceeding' },

  // STORAGE
  { id: 'AAS_UPDATE', category: NodeCategory.STORAGE, label: 'AAS Update', icon: 'Database', color: '#10B981', description: 'Synchronizes with Asset Administration Shell server' },
  { id: 'REPORT_GEN', category: NodeCategory.STORAGE, label: 'Report Generation', icon: 'FileText', color: '#10B981', description: 'Generates Digital Passport PDF report' },

  // === Digital Thread Lifecycle Nodes ===
  { id: 'CAD_RELEASE', category: NodeCategory.MANUAL, label: 'CAD Release', icon: 'PenTool', color: '#3B82F6', description: 'Release STEP/CATPART design files', defaultPartner: 'CAI', expectedOutput: '.step / .catpart' },
  { id: 'MATERIAL_SPEC', category: NodeCategory.MANUAL, label: 'Material Specification', icon: 'FlaskConical', color: '#F59E0B', description: 'Define material card and tape specification', defaultPartner: 'AIMPLAS', expectedOutput: 'material_card.json' },
  { id: 'PROCESS_SIM', category: NodeCategory.AUTOMATIC, label: 'Process Simulation', icon: 'Cpu', color: '#8B5CF6', description: 'Run consolidation simulation model', defaultPartner: 'ENS', expectedOutput: 'consolidation_report.pdf' },
  { id: 'ATL_MANUFACTURING', category: NodeCategory.MANUAL, label: 'ATL Manufacturing', icon: 'Wrench', color: '#F59E0B', description: 'Automated Tape Laying deposition process', defaultPartner: 'AIM / MSQ', expectedOutput: 'process_logs.parquet' },
  { id: 'NDI_SCAN', category: NodeCategory.MANUAL, label: 'NDI Inspection', icon: 'ScanSearch', color: '#F59E0B', description: 'Non-destructive ultrasound/XCT inspection', defaultPartner: 'IMD / IDK', expectedOutput: 'ultrasound_scan.raw' },
  { id: 'AI_DEFECT_DETECTION', category: NodeCategory.AUTOMATIC, label: 'AI Defect Detection', icon: 'Brain', color: '#8B5CF6', description: 'AI-powered defect detection on NDI data', defaultPartner: 'IMD', expectedOutput: 'defect_map.json' },
  { id: 'SHM_CALIBRATION', category: NodeCategory.AUTOMATIC, label: 'SHM Calibration', icon: 'Activity', color: '#8B5CF6', description: 'Structural Health Monitoring digital twin calibration', defaultPartner: 'IMD / AIM', expectedOutput: 'digital_twin_config.xml' },
  { id: 'REPAIRING', category: NodeCategory.MANUAL, label: 'Repairing', icon: 'Hammer', color: '#F59E0B', description: 'Composite repair process and patch design', defaultPartner: 'AIM / NTNU / MSQ', expectedOutput: 'patch_design.json' },
  { id: 'DELAMINATION_PROCESS', category: NodeCategory.MANUAL, label: 'Delamination Process', icon: 'Layers', color: '#F59E0B', description: 'Controlled delamination for material recovery', defaultPartner: 'AIM / IPT', expectedOutput: 'recovered_material_metadata.json' },
  { id: 'RECYCLING_PLAN', category: NodeCategory.MANUAL, label: 'Recycling Plan', icon: 'Recycle', color: '#10B981', description: 'End-of-life recycling planning and reporting', defaultPartner: 'AIMPLAS', expectedOutput: 'recycling_report.pdf' },
]

export const NODE_CATALOG_MAP = Object.fromEntries(NODE_CATALOG.map(n => [n.id, n]))

// Aligned with GENERIC_PALETTE so the canvas matches the palette.
// AUTOMATIC + MANUAL both collapse to TASK kind → share the Task blue.
export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  [NodeCategory.TRIGGER]: '#10B981',
  [NodeCategory.AUTOMATIC]: '#3B82F6',
  [NodeCategory.MANUAL]: '#3B82F6',
  [NodeCategory.GATEWAY]: '#F59E0B',
  [NodeCategory.STORAGE]: '#6B7280',
}

/** Canonical kind → palette colour mapping (the source of truth). */
export const KIND_COLORS: Record<NodeKind, string> = {
  [NodeKind.TRIGGER]: '#10B981',
  [NodeKind.TASK]: '#3B82F6',
  [NodeKind.GATEWAY]: '#F59E0B',
}

/** Resolve the colour for a node: explicit override > kind > legacy category fallback. */
export function nodeColor(opts: {
  color?: string | null
  kind?: NodeKind | null
  category?: NodeCategory | string | null
}): string {
  if (opts.color) return opts.color
  if (opts.kind && KIND_COLORS[opts.kind]) return KIND_COLORS[opts.kind]
  if (opts.category && CATEGORY_COLORS[opts.category as NodeCategory]) {
    return CATEGORY_COLORS[opts.category as NodeCategory]
  }
  return KIND_COLORS[NodeKind.TASK]
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  [NodeCategory.TRIGGER]: 'Trigger',
  [NodeCategory.AUTOMATIC]: 'Automatic',
  [NodeCategory.MANUAL]: 'Manual',
  [NodeCategory.GATEWAY]: 'Gateway',
  [NodeCategory.STORAGE]: 'Storage',
}
