import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * Generates AAS (Asset Administration Shell) submodels from Digital Thread
 * data, following the IDTA reference submodel templates where one exists:
 *   - Nameplate       (IDTA 02006 v3.0) — product identity (urn/name/owner/country)
 *                       semanticId https://admin-shell.io/idta/nameplate/3/0/Nameplate
 *   - TechnicalData   (IDTA 02003 v2.0) — root semanticId = ECLASS IRDI 0173-1#01-AHX837#002
 *   - HandoverDoc     (IDTA 02004 v2.0) — root semanticId = ECLASS IRDI 0173-1#01-AHF578#003
 *   - TimeSeriesData  (IDTA 02008 v1.1) — https://admin-shell.io/idta/TimeSeries/1/1
 *   - ProvenanceLog   (custom)  — no IDTA standard exists for PROV-O lineage; kept custom
 *   - WorkflowExecution (custom) — pending IDTA 02100 "Manufacturing Work Description"
 *
 * All outputs are AAS-compliant JSON objects ready to POST to an AAS server
 * (BaSyx / AAS4J) via `AasServerClient`.
 */
@Injectable()
export class AasSubmodelsService {
  constructor(private prisma: PrismaService) {}

  // ── TechnicalData (IDTA 02003) ────────────────────────────────────────────

  async technicalData(iterationId: string) {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId }, include: { machine: true },
    })
    if (!iter) return null
    const metadata = JSON.parse(iter.metadataJson || '{}')
    // IDTA 02003 v2.0 — root submodel semanticId is the ECLASS IRDI (NOT an
    // admin-shell.io URI). See backend/docs/aas-minimum-example.md.
    return this.submodel('TechnicalData', '0173-1#01-AHX837#002', [
      this.prop('ManufacturerName', metadata.partnerOwner ?? 'Digital Thread'),
      this.prop('ManufacturerProductDesignation', iter.machine?.name ?? ''),
      this.prop('ManufacturerArticleNumber', iter.machine?.version ?? ''),
      this.prop('Workflow', iter.machine?.name ?? ''),
      this.prop('ComponentRef', metadata.componentRef ?? ''),
      this.prop('LotId', metadata.lotId ?? ''),
      this.prop('IterationId', iter.displayId),
      this.prop('CompletedAt', iter.completedAt?.toISOString() ?? ''),
    ])
  }

  // ── HandoverDocumentation (IDTA 02004) ────────────────────────────────────

  async handoverDocumentation(iterationId: string) {
    const files = await this.prisma.fileRecord.findMany({ where: { iterationId } })
    const manifests = await this.prisma.iterationManifest.findMany({ where: { iterationId } })
    // IDTA 02004 v2.0 (VDI 2770) — root submodel semanticId is the ECLASS IRDI.
    return this.submodel('HandoverDocumentation', '0173-1#01-AHF578#003', [
      ...files.map((f) => this.smc(`Document_${f.id.slice(0, 8)}`, [
        this.prop('Title', f.filename),
        this.prop('ContentHash', f.contentHash ?? ''),
        this.prop('Classification', f.classification),
        this.prop('PathKind', f.pathKind),
        this.prop('SizeBytes', String(f.sizeBytes)),
        this.prop('ContentType', f.contentType),
      ])),
      ...manifests.map((m, i) => this.smc(`Manifest_${i}`, [
        this.prop('ManifestHash', m.manifestHash),
        this.prop('Signed', m.signature ? 'true' : 'false'),
      ])),
    ])
  }

  // ── TimeSeriesData (IDTA 02008) ───────────────────────────────────────────

  async timeSeriesData(iterationId: string, nodeId: string) {
    const ingest = await this.prisma.ingestRecord.findMany({
      where: { iterationId, nodeId, status: 'OK' },
      orderBy: { receivedAt: 'asc' },
    })
    return this.submodel('TimeSeriesData', 'https://admin-shell.io/idta/TimeSeries/1/1', [
      this.smc('InternalSegment', ingest.slice(0, 1000).map((r) => this.prop(
        `t_${r.receivedAt.toISOString()}`, r.payloadPreview ?? '',
      ))),
    ])
  }

  // ── Digital Nameplate (IDTA 02006 v3.0) — product identity ────────────────
  // Official IDTA template for the product/asset identity. Emitted for the
  // iteration's attached Product (urn + name + owning Partner). Property
  // semanticIds are keyed to ECLASS / IEC CDD IRDIs per the template.

  async digitalNameplate(iterationId: string) {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { product: { include: { ownerPartner: true } } },
    })
    const product = iter?.product
    if (!product) return null
    const owner = product.ownerPartner
    return this.submodel('Nameplate', 'https://admin-shell.io/idta/nameplate/3/0/Nameplate', [
      this.propS('URIOfTheProduct', product.urn, '0173-1#02-AAY811#001'),
      this.propS('ManufacturerName', owner?.fullName ?? owner?.name ?? 'Digital Thread', '0173-1#02-AAO677#002'),
      this.propS('ManufacturerProductDesignation', product.name, '0173-1#02-AAW338#001'),
      // Country code of the owning partner (ISO 3166-1 alpha-2).
      this.smc('AddressInformation', [
        this.propS('NationalCode', owner?.country ?? '', '0173-1#02-AAO730#001'),
      ]),
    ])
  }

  // ── ProvenanceLog (draft submodel) ────────────────────────────────────────

  async provenanceLog(iterationId: string) {
    const events = await this.prisma.timelineEvent.findMany({
      where: { iterationId }, orderBy: { timestamp: 'asc' },
    })
    return this.submodel('ProvenanceLog', 'urn:digital-thread:submodel:ProvenanceLog:1:0', [
      ...events.map((e, i) => this.smc(`Event_${String(i).padStart(4, '0')}`, [
        this.prop('Timestamp', e.timestamp.toISOString()),
        this.prop('Action', e.action),
        this.prop('NodeId', e.nodeId),
        this.prop('Partner', e.partner),
        this.prop('Detail', e.detail ?? ''),
      ])),
    ])
  }

  // ── Full Shell (asset Instance) ───────────────────────────────────────────
  // Bundles the iteration as an `assetKind=Instance` AAS shell with all
  // applicable submodels inline (TechnicalData, HandoverDocumentation,
  // ProvenanceLog, WorkflowExecution). Single self-contained JSON document, AAS
  // v3 metamodel compliant, ready to drop into BaSyx / AAS4J or to sign + ship
  // cross-partner.

  async iterationShell(iterationId: string) {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { machine: true, nodeStates: true },
    })
    if (!iter) return null
    const metadata = JSON.parse(iter.metadataJson || '{}')

    const [technical, handover, provenance, nameplate] = await Promise.all([
      this.technicalData(iterationId),
      this.handoverDocumentation(iterationId),
      this.provenanceLog(iterationId),
      this.digitalNameplate(iterationId),
    ])

    const execution = this.workflowExecutionSubmodel(iter)

    const assetId = `urn:digitalthread:asset:iteration:${iter.id}`
    const shellId = `urn:digitalthread:aas:iteration:${iter.id}`

    return {
      modelType: 'AssetAdministrationShell',
      id: shellId,
      idShort: iter.displayId.replace(/[^a-zA-Z0-9_]/g, '_'),
      description: [
        { language: 'en', text: `Iteration ${iter.displayId} of workflow "${iter.machineName}" (v${iter.machine?.version ?? '?'})` },
      ],
      assetInformation: {
        assetKind: 'Instance', // an iteration maps 1:1 to an AAS asset Instance
        globalAssetId: assetId,
        specificAssetIds: [
          { name: 'componentRef', value: String(metadata.componentRef ?? '') },
          { name: 'lotId', value: String(metadata.lotId ?? '') },
          { name: 'displayId', value: iter.displayId },
        ],
      },
      // Inline submodels so a single AAS file carries the whole handover.
      // Nameplate (IDTA 02006) is included only when a Product is attached.
      submodelInline: [nameplate, technical, handover, provenance, execution].filter(Boolean),
      // Convenience pointer back to the Type-level shell (machine).
      derivedFrom: {
        type: 'ExternalReference',
        keys: [
          { type: 'AssetAdministrationShell', value: `urn:digitalthread:aas:machine:${iter.machineId}` },
        ],
      },
    }
  }

  private workflowExecutionSubmodel(iter: any) {
    const states = iter.nodeStates ?? []
    return this.submodel(
      'WorkflowExecution',
      'urn:digital-thread:submodel:WorkflowExecution:1:0',
      [
        this.prop('Status', iter.status),
        this.prop('StartedAt', iter.createdAt?.toISOString() ?? ''),
        this.prop('CompletedAt', iter.completedAt?.toISOString() ?? ''),
        this.prop('MachineId', iter.machineId),
        this.prop('MachineName', iter.machineName),
        this.smc(
          'NodeStates',
          states.map((s: any) =>
            this.smc(`Node_${s.nodeId.replace(/[^a-zA-Z0-9_]/g, '_')}`, [
              this.prop('NodeId', s.nodeId),
              this.prop('Status', s.status),
              this.prop('StartedAt', s.startedAt?.toISOString() ?? ''),
              this.prop('CompletedAt', s.completedAt?.toISOString() ?? ''),
              this.prop('ClaimedBy', s.claimedBy ?? ''),
              this.prop('OutputsJson', s.outputsJson ?? '{}'),
              this.prop('OutputFilePath', s.outputFilePath ?? ''),
              this.prop('ErrorMessage', s.errorMessage ?? ''),
            ]),
          ),
        ),
      ],
    )
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private submodel(idShort: string, semanticId: string, elements: object[]) {
    return {
      modelType: 'Submodel',
      idShort,
      id: `${semanticId}#${idShort}`,
      semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: semanticId }] },
      submodelElements: elements,
    }
  }

  private prop(idShort: string, value: string | number) {
    return { modelType: 'Property', idShort, valueType: typeof value === 'number' ? 'xs:double' : 'xs:string', value: String(value) }
  }

  /** Property carrying an ECLASS/IEC-CDD semanticId (for IDTA-templated elements). */
  private propS(idShort: string, value: string | number, semanticId: string) {
    return {
      modelType: 'Property',
      idShort,
      valueType: typeof value === 'number' ? 'xs:double' : 'xs:string',
      value: String(value),
      semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: semanticId }] },
    }
  }

  private smc(idShort: string, elements: object[]) {
    return { modelType: 'SubmodelElementCollection', idShort, value: elements }
  }
}
