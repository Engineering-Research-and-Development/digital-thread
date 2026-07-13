/**
 * Digital Thread API Client
 * Fetch-based client with automatic JWT token refresh.
 */

const BASE = '/api/v1'

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem('access_token')
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('access_token', access)
  localStorage.setItem('refresh_token', refresh)
}

export function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

/**
 * True when the current access token was minted by the OIDC federation path
 * (`iss = 'dt-oidc'`). Used to route logout through the IdP end_session endpoint
 * (RP-initiated single logout) instead of the local /auth/logout. Best-effort:
 * decodes the JWT payload without verifying its signature.
 */
export function isOidcSession(): boolean {
  const t = getAccessToken()
  if (!t) return false
  try {
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    return JSON.parse(atob(b64 + pad)).iss === 'dt-oidc'
  } catch {
    return false
  }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

interface RequestExtras {
  /** When true, read the response body as text() instead of json() — for
   * non-JSON responses such as XML (AutomationML export). */
  expectText?: boolean
}

async function request<T = any>(
  path: string,
  opts: RequestInit & RequestExtras = {},
  retry = true,
): Promise<T> {
  const { expectText, ...fetchOpts } = opts
  const token = getAccessToken()
  const headers: HeadersInit = {
    // Only declare a JSON content-type when a body is actually sent — Fastify
    // rejects an empty body when content-type is 'application/json' (400).
    ...(fetchOpts.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchOpts.headers ?? {}),
  }

  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, headers })

  if (res.status === 401 && retry) {
    // Try token refresh
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setTokens(data.access_token, data.refresh_token)
        return request<T>(path, opts, false)
      }
    }
    clearTokens()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const err = await res.json()
      errMsg = err.message ?? errMsg
    } catch {}
    throw new Error(errMsg)
  }

  if (res.status === 204) return undefined as T
  if (expectText) return (await res.text()) as unknown as T
  return res.json()
}

// ─── Upload with progress (XHR) ─────────────────────────────────────────────
// fetch() cannot report upload progress, so JSON uploads (base64 payloads) go
// through XHR. Reports per-request progress and does a single token-refresh
// retry on 401, mirroring request().

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}
export type UploadProgressCb = (p: UploadProgress) => void

async function xhrPostJson<T = any>(
  path: string,
  body: unknown,
  onProgress?: UploadProgressCb,
  retry = true,
): Promise<T> {
  const token = getAccessToken()
  const payload = JSON.stringify(body)
  const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`)
    xhr.setRequestHeader('Content-Type', 'application/json')
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, percent: Math.round((e.loaded / e.total) * 100) })
        }
      }
    }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText })
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(payload)
  })

  if (result.status === 401 && retry) {
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setTokens(data.access_token, data.refresh_token)
        return xhrPostJson<T>(path, body, onProgress, false)
      }
    }
    clearTokens()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (result.status < 200 || result.status >= 300) {
    let msg = `HTTP ${result.status}`
    try { msg = JSON.parse(result.text).message ?? msg } catch {}
    throw new Error(msg)
  }
  if (result.status === 204 || !result.text) return undefined as T
  try { return JSON.parse(result.text) as T } catch { return undefined as T }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const auth = {
  login(email: string, password: string) {
    return fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Login failed')
      }
      return res.json()
    })
  },

  logout() {
    return request('/auth/logout', { method: 'POST' })
  },

  me() {
    return request('/auth/me')
  },
}

// ─── Machines ─────────────────────────────────────────────────────────────────

const machines = {
  list(page = 1, limit = 50) {
    return request(`/machines?page=${page}&limit=${limit}`)
  },

  get(id: string) {
    return request(`/machines/${id}`)
  },

  create(data: any) {
    return request('/machines', { method: 'POST', body: JSON.stringify(data) })
  },

  update(id: string, data: any) {
    return request(`/machines/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  updateGraph(id: string, nodes: any[], edges: any[], groups?: any[]) {
    return request(`/machines/${id}/graph`, {
      method: 'PUT',
      // Groups (visual node groups) are frozen alongside nodes/edges.
      body: JSON.stringify({ nodes, edges, ...(groups !== undefined ? { groups } : {}) }),
    })
  },

  delete(id: string) {
    return request(`/machines/${id}`, { method: 'DELETE' })
  },

  getIterations(id: string, page = 1, limit = 50) {
    return request(`/machines/${id}/iterations?page=${page}&limit=${limit}`)
  },

  /** Immutable version history of a state machine. */
  listVersions(id: string) {
    return request<Array<{
      id: string
      versionNumber: number
      versionLabel: string | null
      createdAt: string
      createdById: string | null
      nodeCount: number
      edgeCount: number
      iterationCount: number
    }>>(`/machines/${id}/versions`)
  },

  /** Full snapshot of a specific version (nodes + edges). */
  getVersion(id: string, n: number) {
    return request<{
      id: string
      stateMachineId: string
      versionNumber: number
      versionLabel: string | null
      createdAt: string
      createdById: string | null
      nodes: any[]
      edges: any[]
    }>(`/machines/${id}/versions/${n}`)
  },
}

// ─── Iterations ───────────────────────────────────────────────────────────────

const iterations = {
  list(machineId?: string, opts?: { productId?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams({
      page: String(opts?.page ?? 1),
      limit: String(opts?.limit ?? 50),
    })
    if (machineId) params.set('machineId', machineId)
    if (opts?.productId) params.set('productId', opts.productId)
    return request(`/iterations?${params}`)
  },

  get(id: string) {
    return request(`/iterations/${id}`)
  },

  /**
   * Create an iteration. OWNER → owning partner is their own;
   * SUPERADMIN must pass `ownerPartnerId`. `productId` optionally attaches a
   * Product (must belong to the owning partner).
   */
  create(
    machineId: string,
    opts?: {
      metadata?: Record<string, string>
      ownerPartnerId?: string
      productId?: string
      classification?: string
    },
  ) {
    return request('/iterations', {
      method: 'POST',
      body: JSON.stringify({ machineId, ...(opts ?? {}) }),
    })
  },

  delete(id: string) {
    return request(`/iterations/${id}`, { method: 'DELETE' })
  },

  restart(id: string, fromNodeId: string) {
    return request(`/iterations/${id}/restart`, {
      method: 'POST',
      body: JSON.stringify({ fromNodeId }),
    })
  },

  getNodeStates(id: string) {
    return request(`/iterations/${id}/nodes`)
  },

  claimNode(id: string, nodeId: string) {
    return request(`/iterations/${id}/nodes/${nodeId}/claim`, { method: 'PATCH', body: JSON.stringify({}) })
  },

  completeNode(id: string, nodeId: string, outputFilePath?: string) {
    return request(`/iterations/${id}/nodes/${nodeId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ outputFilePath }),
    })
  },

  setInputFile(id: string, nodeId: string, inputId: string, filePathOrIds: string | string[]) {
    const body = Array.isArray(filePathOrIds)
      ? { inputId, fileIds: filePathOrIds }
      : { inputId, filePath: filePathOrIds }
    return request(`/iterations/${id}/nodes/${nodeId}/input-file`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Predecessor outputs available for download at this node. */
  listPredecessorOutputs(id: string, nodeId: string) {
    return request<{
      iterationId: string
      nodeId: string
      inputs: Array<{
        inputId: string
        inputName: string
        required: boolean
        cardinality: 'ONE' | 'MANY'
        fileTypes: string[]
        from: { nodeId: string; outputId: string }
        upstreamNodeName?: string
        upstreamOutputName?: string
        files: Array<{
          id: string
          filename: string
          version: number
          sizeBytes: number
          contentType: string
          contentHash: string | null
          timestamp: string
          classification: string
        }>
        legacyFilePath?: string
      }>
    }>(`/iterations/${id}/nodes/${nodeId}/predecessor-outputs`)
  },

  /**
   * Files bound to a node's OWN output slots, resolved from the node's
   * `outputsJson` by id. Surfaces files attached from another iteration ("link
   * existing") and locked files (which a plain `files.list(iterationId, nodeId)`
   * misses), so the panel can render downloads / "Request access" correctly.
   */
  listNodeOutputs(id: string, nodeId: string) {
    return request<{
      iterationId: string
      nodeId: string
      filesBySlot: Record<string, Array<{
        id: string
        filename: string
        version: number
        sizeBytes: number
        contentType: string
        contentHash: string | null
        timestamp: string
        classification: string
        nodeOutputId: string
      }>>
    }>(`/iterations/${id}/nodes/${nodeId}/outputs`)
  },

  getTimeline(id: string) {
    return request(`/iterations/${id}/timeline`)
  },

  /** Attach an existing file (raw or from another iteration) as a node output. */
  attachExistingOutput(id: string, nodeId: string, outputId: string, fileId: string) {
    return request(`/iterations/${id}/nodes/${nodeId}/attach-output`, {
      method: 'POST',
      body: JSON.stringify({ outputId, fileId }),
    })
  },
}

// ─── Execution ────────────────────────────────────────────────────────────────

const exec = {
  run(payload: {
    nodeTypeId: string
    iterationId: string
    nodeId: string
    nodeLabel: string
    partner?: string
    config?: Record<string, any>
    inputs?: Record<string, unknown>
  }) {
    return request('/exec/run', { method: 'POST', body: JSON.stringify(payload) })
  },
}

// ─── Files ────────────────────────────────────────────────────────────────────

const files = {
  /** `scope`: RAW (unattached) | NODE (iteration-produced) | ALL. */
  list(iterationId?: string, nodeId?: string, scope?: 'RAW' | 'NODE' | 'ALL') {
    const params = new URLSearchParams()
    if (iterationId) params.set('iterationId', iterationId)
    if (nodeId) params.set('nodeId', nodeId)
    if (scope) params.set('scope', scope)
    return request(`/files?${params}`)
  },

  upload(
    payload: {
      filename: string
      contentType?: string
      base64Data?: string
      iterationId: string
      nodeId: string
      /** Declared output slot id this upload fulfils. */
      nodeOutputId?: string
      nodeLabel: string
      uploadType: 'MANUAL' | 'AUTOMATIC'
      bucket?: string
      sourceInfo?: string
      /** Governance — file classification (PUBLIC/INTERNAL/PARTNER/CONFIDENTIAL/RESTRICTED).
       * Defaults to INTERNAL when omitted. */
      classification?: string
    },
    onProgress?: UploadProgressCb,
  ) {
    // XHR (not fetch) so the global upload-progress popover can show per-file bars.
    return xhrPostJson('/files/upload', payload, onProgress)
  },

  /** Upload a RAW file not attached to any iteration/node. */
  rawUpload(
    payload: {
      filename: string
      contentType?: string
      base64Data: string
      classification?: 'PUBLIC' | 'INTERNAL' | 'PARTNER'
      bucket?: string
    },
    onProgress?: UploadProgressCb,
  ) {
    return xhrPostJson('/files/raw-upload', payload, onProgress)
  },

  /** Fetch a single FileRecord — runs backend assertReadable. Used as a
   * permission probe before launching a window.open() download. */
  findOne(id: string) {
    return request<{ id: string; filename: string; classification: string; iterationId: string; nodeSourceId: string }>(`/files/${id}`)
  },

  downloadUrl(id: string, version?: number) {
    const token = getAccessToken()
    const params = new URLSearchParams()
    if (token) params.set('token', token)
    if (version !== undefined) params.set('version', String(version))
    return `${BASE}/files/${id}/download?${params}`
  },

  /** Fetch the authorised file bytes as a Blob through the same gated download
   * route (`assertReadable` runs server-side). Used by the in-browser 3D
   * preview so the source CAD never has to be re-served unprotected. Throws
   * `Error("HTTP <status>")` on a non-2xx response. */
  async fetchBlob(id: string, version?: number): Promise<Blob> {
    const res = await fetch(files.downloadUrl(id, version))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  },

  /**
   * Raise a FileAccessRequest for a file the requester cannot currently read.
   * Idempotent on (fileId, requesterId, PENDING) — re-raising reuses the
   * existing PENDING row.
   */
  requestAccess(fileId: string, reason?: string, iterationId?: string) {
    return request<{
      id?: string
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'ALREADY_READABLE'
      fileId?: string
    }>(`/files/${fileId}/request-access`, {
      method: 'POST',
      // iterationId = the iteration the requester is viewing, so governance can
      // link back to where access was requested (not the file's origin).
      body: JSON.stringify({ reason, ...(iterationId ? { iterationId } : {}) }),
    })
  },

  /** Partner: list my own (pending / decided) access requests. */
  myAccessRequests() {
    return request<Array<{
      id: string
      fileId: string
      status: string
      reason: string | null
      createdAt: string
      decidedAt: string | null
      grantExpiresAt: string | null
      file?: { filename: string; classification: string; iterationId: string; nodeSourceLabel: string }
    }>>(`/files/access-requests/mine`)
  },
}

// ─── Partners ─────────────────────────────────────────────────────────────────

const partners = {
  list() {
    return request('/partners')
  },

  create(data: any) {
    return request('/partners', { method: 'POST', body: JSON.stringify(data) })
  },

  update(id: string, data: any) {
    return request(`/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  delete(id: string) {
    return request(`/partners/${id}`, { method: 'DELETE' })
  },
}

// ─── Data Sources ─────────────────────────────────────────────────────────────

const datasources = {
  list() {
    return request('/datasources')
  },

  get(id: string) {
    return request(`/datasources/${id}`)
  },

  create(data: any) {
    return request('/datasources', { method: 'POST', body: JSON.stringify(data) })
  },

  update(id: string, data: any) {
    return request(`/datasources/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },

  delete(id: string) {
    return request(`/datasources/${id}`, { method: 'DELETE' })
  },

  testConnection(id: string) {
    return request(`/datasources/${id}/test-connection`, { method: 'POST' })
  },
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

/**
 * Returns the SSE URL for an iteration.
 * Token is passed as query param since EventSource can't set headers.
 */
function sseUrl(iterationId: string): string {
  const token = getAccessToken()
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  return `${BASE}/sse/iterations/${iterationId}/events?${params}`
}

// ─── Standards ───────────────────────────────────────────────────────────────

const standards = {
  exportAas(machineId: string) {
    return request(`/aas/machines/${machineId}`)
  },

  importAas(body: any) {
    return request('/aas/import', { method: 'POST', body: JSON.stringify(body) })
  },

  exportDtdl(machineId: string) {
    return request(`/dtdl/machines/${machineId}`)
  },

  importDtdl(body: any) {
    return request('/dtdl/import', { method: 'POST', body: JSON.stringify(body) })
  },

  /** DTDL twin instance of an iteration (models[] + twins[]). */
  exportDtdlIteration(iterationId: string) {
    return request(`/dtdl/iteration/${iterationId}`)
  },

  exportAml(machineId: string) {
    // AML response is XML (Content-Type: application/xml), not JSON.
    return request<string>(`/aml/machines/${machineId}`, { expectText: true })
  },

  importAml(body: any) {
    return request('/aml/import', { method: 'POST', body: JSON.stringify(body) })
  },

  /**
   * Downloads the canonical example for a given format (AAS/DTDL/AML) by
   * re-exporting the seeded `sm-uc-manual-upload` machine. Triggers a browser
   * download with the right MIME + filename.
   */
  async downloadExample(format: 'aas' | 'dtdl' | 'aml') {
    const blob = await fetchAuthBlob(`/standards/${format}/example`)
    const suffix = format === 'aas' ? 'aas.json' : format === 'dtdl' ? 'dtdl.json' : 'aml'
    triggerBlobDownload(blob, `digital-thread-example.${suffix}`)
  },

  /**
   * Fetches the full reference markdown for a format as plain text.
   * Consumed by the in-app `/docs/standards/:format` viewer, which renders it
   * with react-markdown so users get a properly styled page (not raw text).
   */
  getReferenceMarkdown(format: 'aas' | 'dtdl' | 'aml'): Promise<string> {
    return request<string>(`/standards/${format}/reference`, { expectText: true })
  },
}

// ─── Auth-aware blob helpers (for file downloads) ────────────────────────────

async function fetchAuthBlob(path: string): Promise<Blob> {
  const token = getAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const err = await res.json()
      msg = err.message ?? msg
    } catch {}
    throw new Error(msg)
  }
  return res.blob()
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Lineage / Provenance / Users ─────────────────────────────────────────────

export interface LineagePartner {
  id: string
  code: string
  fullName: string
  color: string
}

/**
 * One (iteration × node) reference to a file. Aggregated by the backend so the
 * lineage page can show the file's full set of usages (OUTPUT origin + every
 * INPUT consumption), spanning iterations.
 */
export interface LineageUsage {
  iterationId: string
  iterationDisplayId: string | null
  iterationStatus: string | null
  nodeId: string
  nodeLabel: string | null
  role: 'OUTPUT' | 'INPUT'
  inputId: string | null
  outputId: string | null
}

export interface LineageFileNode {
  id: string
  filename: string
  bucket?: string
  classification?: string
  contentHash?: string | null
  uploadType?: string
  iterationId: string
  nodeSourceId?: string
  nodeSourceLabel?: string
  nodeOutputId?: string | null
  sizeBytes?: number
  timestamp?: string
  contentType?: string
  /** Denormalised iteration/partner context populated by LineageService.getFullGraph. */
  iterationDisplayId: string | null
  iterationStatus: string | null
  iterationMachineName: string | null
  iterationCreatedAt: string | null
  iterationCompletedAt: string | null
  partner: LineagePartner | null
  /** Cross-iteration usages — OUTPUT origin + INPUT consumptions across all iterations. */
  usages: LineageUsage[]
}

export interface LineageEdgeData {
  id: string
  source: string
  target: string
  relationType: string
  createdAt?: string
  transformInfo?: { handlerName?: string; handlerVersion?: string; provenanceAgentId?: string | null } | null
}

export interface LineageGraphResponse {
  root: string
  nodes: LineageFileNode[]
  edges: LineageEdgeData[]
}

const lineage = {
  upstream(fileId: string, depth = 5) {
    return request(`/lineage/files/${encodeURIComponent(fileId)}/upstream?depth=${depth}`)
  },
  downstream(fileId: string, depth = 5) {
    return request(`/lineage/files/${encodeURIComponent(fileId)}/downstream?depth=${depth}`)
  },
  full(fileId: string, depth = 5) {
    return request<LineageGraphResponse>(
      `/lineage/files/${encodeURIComponent(fileId)}/full?depth=${depth}`,
    )
  },
  /** Backfill — recompute lineage edges for a whole iteration. */
  rebuildForIteration(iterationId: string) {
    return request<{ iterationId: string; nodesProcessed: number; nodesWithEdges: number; edgesCreated: number }>(
      `/lineage/iterations/${encodeURIComponent(iterationId)}/rebuild`,
      { method: 'POST', body: JSON.stringify({}) },
    )
  },
}

export type ProvGraphNodeKind = 'activity' | 'entity' | 'agent'
export type ProvGraphEdgeKind =
  | 'wasGeneratedBy'
  | 'wasAttributedTo'
  | 'wasAssociatedWith'
  | 'wasInformedBy'
  | 'wasDerivedFrom'
  | 'wasRevisionOf'
  | 'used'

export interface ProvGraphNode {
  id: string
  kind: ProvGraphNodeKind
  label: string
  subtype?: string
  attrs?: Record<string, string | undefined>
}

export interface ProvGraphEdge {
  id: string
  source: string
  target: string
  relation: ProvGraphEdgeKind
}

export interface ProvGraph {
  iterationId: string
  rootId: string
  nodes: ProvGraphNode[]
  edges: ProvGraphEdge[]
}

export type StoryCollectionMethod = 'MANUAL' | 'AUTOMATIC' | 'INGESTED' | 'IMPORTED' | 'DERIVED'

export interface StoryPartner {
  id: string
  code: string
  fullName: string
  color: string
  role: string | null
}

export interface StoryAgent {
  id: string
  type: 'HANDLER' | 'USER' | 'EXTERNAL'
  name: string
  version: string | null
}

export interface StoryStep {
  nodeStateId: string
  nodeId: string
  nodeLabel: string
  kind: string
  status: string
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
  partner: StoryPartner | null
  agent: StoryAgent | null
  transformation: string
  collectionMethod: StoryCollectionMethod
  inputFileIds: string[]
  outputFileIds: string[]
}

export interface StoryFile {
  id: string
  filename: string
  path: string
  sizeBytes: number
  contentType: string
  contentHash: string | null
  classification: string
  uploadType: string
  sourceInfo: string
  timestamp: string
  iterationId: string
  ownerIterationDisplayId: string | null
  nodeStateId: string | null
  nodeId: string
  nodeLabel: string
  outputId: string | null
  partner: StoryPartner | null
  agent: StoryAgent | null
  transformation: string
  collectionMethod: StoryCollectionMethod
  upstreamFileIds: string[]
  downstreamFileIds: string[]
  external: boolean
}

export interface IterationStory {
  iterationId: string
  displayId: string
  machineId: string
  machineName: string
  status: string
  startedAt: string
  endedAt: string | null
  parentIterationId: string | null
  restartFromNodeId: string | null
  partners: StoryPartner[]
  steps: StoryStep[]
  files: StoryFile[]
}

const provenance = {
  json(iterationId: string) {
    return request(`/provenance/iteration/${encodeURIComponent(iterationId)}`)
  },
  graph(iterationId: string) {
    return request<ProvGraph>(`/provenance/iteration/${encodeURIComponent(iterationId)}/graph`)
  },
  story(iterationId: string) {
    return request<IterationStory>(`/provenance/iteration/${encodeURIComponent(iterationId)}/story`)
  },
  ttlUrl(iterationId: string) {
    const t = getAccessToken()
    return `${BASE}/provenance/iteration/${encodeURIComponent(iterationId)}.ttl${t ? `?token=${encodeURIComponent(t)}` : ''}`
  },
}

const users = {
  list(filter?: { partnerId?: string; role?: string }) {
    const qs = new URLSearchParams()
    if (filter?.partnerId) qs.set('partnerId', filter.partnerId)
    if (filter?.role) qs.set('role', filter.role)
    return request<any[]>(`/users${qs.toString() ? `?${qs}` : ''}`)
  },
  get(id: string) { return request(`/users/${id}`) },
  create(body: { email: string; password: string; fullName?: string; role: string; partnerId?: string | null }) {
    return request('/users', { method: 'POST', body: JSON.stringify(body) })
  },
  update(id: string, body: any) {
    return request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  remove(id: string) { return request(`/users/${id}`, { method: 'DELETE' }) },
  changePassword(id: string, newPassword: string) {
    return request(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ newPassword }) })
  },
  /** Current user (with partner). */
  me() { return request<any>('/users/me') },
  /** Self-service profile: own display name + own Partner name/country. */
  updateProfile(body: { fullName?: string; partnerFullName?: string; partnerCountry?: string }) {
    return request('/users/me/profile', { method: 'PATCH', body: JSON.stringify(body) })
  },
  /** Personal external-API key (OPERATOR/OWNER). */
  apiKey: {
    /** Metadata (no secret) + connection hints (headerName, basePath, docsPath). */
    get() { return request<any>('/users/me/api-key') },
    /** (Re)generate — returns { token } ONCE. */
    generate() { return request<any>('/users/me/api-key', { method: 'POST', body: JSON.stringify({}) }) },
    /** Invalidate the current key. */
    revoke() { return request('/users/me/api-key', { method: 'DELETE' }) },
  },
}

// ─── Products ─────────────────────────────────────────────────────────────────

const products = {
  /** List products — SUPERADMIN: all; OWNER/OPERATOR: own partner's. */
  list() { return request<any[]>('/products') },
  get(id: string) { return request<any>(`/products/${id}`) },
  /** ownerPartnerId honoured for SUPERADMIN only; OWNER → own partner. */
  create(body: { urn: string; name: string; description?: string; ownerPartnerId?: string }) {
    return request('/products', { method: 'POST', body: JSON.stringify(body) })
  },
  update(id: string, body: { urn?: string; name?: string; description?: string | null; ownerPartnerId?: string }) {
    return request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  remove(id: string) { return request(`/products/${id}`, { method: 'DELETE' }) },
}

// ─── Bindings / Normalization / Enrichment ────────────────────────────────────

const bindings = {
  list(opts: { stateMachineId?: string; dataSourceId?: string } = {}) {
    const qs = new URLSearchParams(opts as any)
    return request<any[]>(`/bindings${qs.toString() ? `?${qs}` : ''}`)
  },
  upsert(body: any) { return request('/bindings', { method: 'POST', body: JSON.stringify(body) }) },
  remove(id: string) { return request(`/bindings/${id}`, { method: 'DELETE' }) },
  resolve(body: { iterationId: string; nodeId: string }) {
    return request<any[]>('/bindings/resolve', { method: 'POST', body: JSON.stringify(body) })
  },
}

const normalization = {
  normalize(body: { payload: any; schema: any[] }) {
    return request('/normalization/normalize', { method: 'POST', body: JSON.stringify(body) })
  },
  units() { return request<{ supported: string[] }>('/normalization/units') },
  urns()  { return request('/normalization/urns') },
  registerUrn(body: { kind: string; urn: string; canonicalName: string; aliases?: string[] }) {
    return request('/normalization/urns', { method: 'POST', body: JSON.stringify(body) })
  },
}

const enrichment = {
  forFile(id: string) { return request<any[]>(`/enrichment/files/${id}`) },
  run(id: string) { return request(`/enrichment/files/${id}/run`, { method: 'POST' }) },
}

const governance = {
  approvals: {
    list(status?: string) { return request<any[]>(`/governance/approvals${status ? `?status=${status}` : ''}`) },
    request(body: any) { return request('/governance/approvals', { method: 'POST', body: JSON.stringify(body) }) },
    decide(id: string, body: { decision: 'APPROVE' | 'REJECT'; comment?: string }) {
      return request(`/governance/approvals/${id}/decide`, { method: 'PATCH', body: JSON.stringify(body) })
    },
    cancel(id: string) { return request(`/governance/approvals/${id}/cancel`, { method: 'PATCH' }) },
  },
  manifests: {
    forIteration(id: string) { return request<any[]>(`/governance/manifests/iteration/${id}`) },
    sign(iterationId: string, partnerId: string) {
      return request(`/governance/manifests/iteration/${iterationId}/sign`, {
        method: 'POST', body: JSON.stringify({ partnerId }),
      })
    },
    verify(manifestId: string) { return request(`/governance/manifests/${manifestId}/verify`) },
  },
  fileAccessRequests: {
    list(status?: string) {
      return request<Array<{
        id: string
        fileId: string
        /** The iteration where the partner requested access (governance link target). */
        iterationId: string | null
        requesterId: string
        requesterPartnerId: string | null
        reason: string | null
        status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'
        decisionNote: string | null
        decidedAt: string | null
        grantExpiresAt: string | null
        createdAt: string
        file?: { id: string; filename: string; classification: string; iterationId: string; nodeSourceLabel: string }
        requester?: { id: string; email: string; fullName: string | null; partnerId: string | null }
        decidedBy?: { id: string; email: string; fullName: string | null } | null
      }>>(`/governance/file-access-requests${status ? `?status=${status}` : ''}`)
    },
    decide(id: string, body: { decision: 'APPROVE' | 'REJECT'; note?: string; grantHours?: number }) {
      return request(`/governance/file-access-requests/${id}/decide`, {
        method: 'PATCH', body: JSON.stringify(body),
      })
    },
  },
  accessLog: () => request<any[]>('/governance/access-log'),
  adminAudit: () => request<any[]>('/governance/admin-audit'),
  loginAudit: () => request<any[]>('/governance/login-audit'),
  dashboard: () => request<{
    pendingApprovals: number
    pendingFileAccessRequests: number
    signedManifests: number
    recentDownloads24h: number
    lockedUsers: number
    filesByClassification: Array<{ classification: string; count: number }>
  }>('/governance/dashboard'),
}

const changeMgmt = {
  listCRs(status?: string) { return request<any[]>(`/change-requests${status ? `?status=${status}` : ''}`) },
  createCR(body: any) { return request('/change-requests', { method: 'POST', body: JSON.stringify(body) }) },
  updateCRStatus(id: string, status: string) {
    return request(`/change-requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  recomputeImpact(id: string) { return request(`/change-requests/${id}/recompute-impact`, { method: 'POST' }) },

  listNCs(filter?: { status?: string; severity?: string }) {
    const qs = new URLSearchParams(filter as any)
    return request<any[]>(`/non-conformances${qs.toString() ? `?${qs}` : ''}`)
  },
  createNC(body: any) { return request('/non-conformances', { method: 'POST', body: JSON.stringify(body) }) },
  updateNC(id: string, body: any) { return request(`/non-conformances/${id}`, { method: 'PATCH', body: JSON.stringify(body) }) },
  ncAffected(id: string) { return request(`/non-conformances/${id}/affected`) },

  listFi(filter?: { componentRef?: string; status?: string }) {
    const qs = new URLSearchParams(filter as any)
    return request<any[]>(`/field-issues${qs.toString() ? `?${qs}` : ''}`)
  },
  createFi(body: any) { return request('/field-issues', { method: 'POST', body: JSON.stringify(body) }) },
  linkFi(id: string, body: any) { return request(`/field-issues/${id}/link`, { method: 'PATCH', body: JSON.stringify(body) }) },
  closeFi(id: string) { return request(`/field-issues/${id}/close`, { method: 'PATCH' }) },
}

const compliance = {
  iterationReport(id: string)    { return request(`/compliance/iteration/${id}/report`) },
  dpp(ref: string)               { return request(`/compliance/components/${encodeURIComponent(ref)}/dpp`) },
  componentPassport(ref: string) { return request(`/components/${encodeURIComponent(ref)}/passport`) },
  listComponents()               { return request<Array<{ componentRef: string; iterationCount: number; lastSeenAt: string }>>('/components') },
  compareSm(left: string, right: string)   { return request(`/compare/state-machines?left=${left}&right=${right}`) },
  compareIter(left: string, right: string) { return request(`/compare/iterations?left=${left}&right=${right}`) },
  /** Diff between two versions of the same state machine. */
  compareSmVersions(machineId: string, left: number, right: number) {
    const params = new URLSearchParams({ machineId, left: String(left), right: String(right) })
    return request(`/compare/state-machine-versions?${params}`)
  },
}

const ingestion = {
  importAid(body: any) { return request('/ingestion/aid/import', { method: 'POST', body: JSON.stringify(body) }) },
  push(body: any) { return request('/ingestion/push', { method: 'POST', body: JSON.stringify(body) }) },
  unassigned() { return request<any[]>('/ingestion/unassigned') },
  assign(id: string, body: any) { return request(`/ingestion/unassigned/${id}/assign`, { method: 'PATCH', body: JSON.stringify(body) }) },
}

const dashboards = {
  me()   { return request('/dashboards/me') },
  kpis() { return request('/dashboards/kpis') },
  trend(bucket: 'day' | 'week' = 'day', last = 30) {
    return request<any[]>(`/dashboards/trend?bucket=${bucket}&last=${last}`)
  },
}

// ─── Batch #3 namespaces ──────────────────────────────────────────────────────

const oidc = {
  config() { return request<{ enabled: boolean; loginUrl: string | null; providerLabel: string }>('/auth/oidc/config') },
  loginUrl: `${BASE}/auth/oidc/login`,
  /** RP-initiated logout — revokes the DT session and returns the IdP end_session
   * URL for the SPA to navigate to (single logout). Only meaningful for federated
   * sessions (see `isOidcSession`). */
  logout() { return request<{ url: string }>('/auth/oidc/logout', { method: 'POST' }) },
}

const retention = {
  policy() { return request<{ days: Record<string, number> }>('/retention/policy') },
  sweep()  { return request('/retention/sweep', { method: 'POST' }) },
  requestErasure(subjectUserId: string, reason?: string) {
    return request(`/retention/erasure/request/${subjectUserId}`, { method: 'POST', body: JSON.stringify({ reason }) })
  },
  executeErasure(approvalRequestId: string) {
    return request(`/retention/erasure/execute/${approvalRequestId}`, { method: 'POST' })
  },
  exportData(subjectUserId: string) { return request(`/retention/export/${subjectUserId}`) },
}

const notificationsApi = {
  events() { return request<{ key: string; label: string; description: string }[]>('/notifications/events') },
  listSubscriptions() { return request<any[]>('/notifications/subscriptions') },
  createSubscription(body: any) { return request('/notifications/subscriptions', { method: 'POST', body: JSON.stringify(body) }) },
  updateSubscription(id: string, body: any) { return request(`/notifications/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }) },
  removeSubscription(id: string) { return request(`/notifications/subscriptions/${id}`, { method: 'DELETE' }) },
  testSubscription(id: string) { return request(`/notifications/subscriptions/${id}/test`, { method: 'POST' }) },
  history(params: { limit?: number; offset?: number; status?: string; eventKey?: string; all?: boolean } = {}) {
    const qs = new URLSearchParams()
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    if (params.status) qs.set('status', params.status)
    if (params.eventKey) qs.set('eventKey', params.eventKey)
    if (params.all) qs.set('all', 'true')
    const q = qs.toString()
    return request<{ items: any[]; total: number; limit: number; offset: number }>(`/notifications/history${q ? `?${q}` : ''}`)
  },
  getSmtp() { return request<any>('/notifications/smtp') },
  saveSmtp(body: any) { return request('/notifications/smtp', { method: 'PUT', body: JSON.stringify(body) }) },
  testSmtp(to: string) { return request('/notifications/smtp/test', { method: 'POST', body: JSON.stringify({ to }) }) },
}

const usage = {
  validatePolicy(policy: any) { return request('/usage/policy/validate', { method: 'POST', body: JSON.stringify(policy) }) },
  listExports() { return request<any[]>('/usage/exports') },
  createExport(body: any) { return request('/usage/exports', { method: 'POST', body: JSON.stringify(body) }) },
  signExport(id: string, signerPartnerId: string) { return request(`/usage/exports/${id}/sign`, { method: 'POST', body: JSON.stringify({ signerPartnerId }) }) },
  transmitExport(id: string) { return request(`/usage/exports/${id}/transmitted`, { method: 'PATCH' }) },
  listImports() { return request<any[]>('/usage/imports') },
  receiveImport(body: any) { return request('/usage/imports', { method: 'POST', body: JSON.stringify(body) }) },
  verifyImport(id: string) { return request(`/usage/imports/${id}/verify`, { method: 'POST' }) },
  acceptImport(id: string) { return request(`/usage/imports/${id}/accept`, { method: 'POST' }) },
  checkAllowed(id: string, action: string, ctx?: Record<string, any>) {
    return request(`/usage/imports/${id}/check`, { method: 'POST', body: JSON.stringify({ action, ctx }) })
  },
}

const aasRegistry = {
  listPeers() { return request<any[]>('/aas/registry/peers') },
  addPeer(body: any) { return request('/aas/registry/peers', { method: 'POST', body: JSON.stringify(body) }) },
  updatePeer(id: string, body: any) { return request(`/aas/registry/peers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }) },
  removePeer(id: string) { return request(`/aas/registry/peers/${id}`, { method: 'DELETE' }) },
  syncPeer(id: string) { return request(`/aas/registry/peers/${id}/sync`, { method: 'POST' }) },
  syncAll() { return request('/aas/registry/sync-all', { method: 'POST' }) },
  catalog(filter?: { peerId?: string; q?: string }) {
    const qs = new URLSearchParams(filter as any)
    return request<any[]>(`/aas/registry/catalog${qs.toString() ? `?${qs}` : ''}`)
  },
}

const observability = {
  tracing() { return request('/observability/tracing') },
}

// ─── Audit (SUPERADMIN only) ─────────────────────────────────────────────────

export interface AuditUserRef {
  id: string
  email: string
  fullName: string | null
  role: string
  partnerId?: string | null
}

export interface AdminAuditEntry {
  id: string
  actorUserId: string
  actorRole: string | null
  action: string
  targetType: string
  targetId: string | null
  detail: string | null
  ip: string | null
  timestamp: string
  actor: AuditUserRef
}

export interface AccessLogEntry {
  id: string
  userId: string
  resourceType: string
  resourceId: string
  action: string
  classification: string | null
  ip: string | null
  timestamp: string
  user: AuditUserRef
}

export interface LoginAuditEntry {
  id: string
  userId: string | null
  email: string
  success: boolean
  ip: string | null
  userAgent: string | null
  reason: string | null
  timestamp: string
  user: AuditUserRef | null
}

export interface PaginatedAudit<T> {
  total: number
  limit: number
  offset: number
  items: T[]
}

export interface AuditSummary {
  windowHours: number
  adminAudit: { total: number; last24h: number }
  accessLog: { total: number; last24h: number }
  login: { last24hSuccess: number; last24hFailed: number }
  adminActionsByRoleLast24h: Array<{ role: string; count: number }>
}

export interface ParsedMetricSample {
  labels: Record<string, string>
  value: number
  suffix?: string
}

export interface ParsedMetric {
  name: string
  type: 'counter' | 'gauge' | 'summary'
  samples: ParsedMetricSample[]
}

export interface ParsedMetricsSnapshot {
  generatedAt: string
  raw: string
  metrics: ParsedMetric[]
}

const audit = {
  summary() { return request<AuditSummary>('/audit/summary') },

  admin(q: {
    limit?: number; offset?: number; actorUserId?: string; actorRole?: string;
    targetType?: string; action?: string; search?: string; from?: string; to?: string;
  } = {}) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v != null && v !== '') qs.set(k, String(v))
    return request<PaginatedAudit<AdminAuditEntry>>(`/audit/admin${qs.toString() ? `?${qs}` : ''}`)
  },

  access(q: {
    limit?: number; offset?: number; userId?: string; resourceType?: string;
    classification?: string; action?: string; from?: string; to?: string;
  } = {}) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v != null && v !== '') qs.set(k, String(v))
    return request<PaginatedAudit<AccessLogEntry>>(`/audit/access${qs.toString() ? `?${qs}` : ''}`)
  },

  logins(q: {
    limit?: number; offset?: number; email?: string; success?: boolean;
    reason?: string; from?: string; to?: string;
  } = {}) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v != null && v !== '') qs.set(k, String(v))
    return request<PaginatedAudit<LoginAuditEntry>>(`/audit/logins${qs.toString() ? `?${qs}` : ''}`)
  },

  metrics() { return request<ParsedMetricsSnapshot>('/audit/metrics') },
}

// ─── Node templates ───────────────────────────────────────────────────────────

export interface NodeTemplate {
  id: string
  slug: string
  label: string
  kind: 'TRIGGER' | 'TASK' | 'GATEWAY'
  icon: string
  color: string
  description: string
  tags: string[]
  defaultPartnerId?: string | null
  inputs: any[]
  outputs: any[]
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

const nodeTemplates = {
  list(enabledOnly = false) {
    return request<NodeTemplate[]>(`/node-templates${enabledOnly ? '?enabledOnly=true' : ''}`)
  },
  get(id: string) { return request<NodeTemplate>(`/node-templates/${id}`) },
  create(body: Partial<NodeTemplate>) {
    return request<NodeTemplate>('/node-templates', { method: 'POST', body: JSON.stringify(body) })
  },
  update(id: string, body: Partial<NodeTemplate>) {
    return request<NodeTemplate>(`/node-templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  remove(id: string) { return request(`/node-templates/${id}`, { method: 'DELETE' }) },
}

const aasSubmodels = {
  /** Full AAS Instance shell for an iteration (asset + all submodels inline).
   *  The only iteration AAS export — per-submodel downloads were removed. */
  shell(id: string)      { return request(`/aas/iteration/${id}/shell`) },
  publishShell(shell: any) { return request('/aas/server/publish/shell', { method: 'POST', body: JSON.stringify({ shell }) }) },
  publishSubmodel(shellId: string, submodel: any) {
    return request('/aas/server/publish/submodel', { method: 'POST', body: JSON.stringify({ shellId, submodel }) })
  },
  register(descriptor: object) { return request('/aas/registry/register', { method: 'POST', body: JSON.stringify({ descriptor }) }) },
  lookup(shellId: string) { return request(`/aas/registry/lookup/${encodeURIComponent(shellId)}`) },
}

export const api = {
  auth,
  machines,
  iterations,
  exec,
  files,
  partners,
  products,
  datasources,
  standards,
  lineage,
  provenance,
  users,
  bindings,
  normalization,
  enrichment,
  governance,
  changeMgmt,
  compliance,
  ingestion,
  dashboards,
  aasSubmodels,
  oidc,
  retention,
  notifications: notificationsApi,
  usage,
  aasRegistry,
  observability,
  nodeTemplates,
  audit,
  sseUrl,
}
