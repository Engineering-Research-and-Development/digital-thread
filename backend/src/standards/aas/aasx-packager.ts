/**
 * Minimal AASX (OPC) package around an AAS 3.0 Environment serialised as JSON.
 * Same layout as the AASX Package Explorer and as
 * docs/idta-02100/tools/aaslib.py `pack_aasx`: the aasx-origin part, the
 * aasx-origin → aas-spec relationship, and the specification part. The
 * specification part is JSON (`/aasx/data.aas.json`), which Part 5 of the AAS
 * specification allows next to XML.
 */
import AdmZip = require('adm-zip')
import type { FastifyReply } from 'fastify'
import { sanitizeIdShort } from './aas-core.util'

export const AASX_CONTENT_TYPE = 'application/asset-administration-shell-package'
export const AASX_DEFAULT_PART = 'data.aas.json'

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />' +
  '<Default Extension="json" ContentType="application/json" />' +
  '<Override PartName="/aasx/aasx-origin" ContentType="text/plain" />' +
  '</Types>'

const ROOT_RELS =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin" Id="Rorigin" />' +
  '</Relationships>'

const originRels = (partName: string) =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/aasx/${partName}" Id="Rspec" />` +
  '</Relationships>'

/** Zip the Environment into an AASX package (Buffer). */
export function packAasx(environment: object, partName = AASX_DEFAULT_PART): Buffer {
  const zip = new AdmZip()
  zip.addFile('[Content_Types].xml', Buffer.from(CONTENT_TYPES, 'utf8'))
  zip.addFile('_rels/.rels', Buffer.from(ROOT_RELS, 'utf8'))
  zip.addFile('aasx/aasx-origin', Buffer.from('Intentionally empty.', 'utf8'))
  zip.addFile('aasx/_rels/aasx-origin.rels', Buffer.from(originRels(partName), 'utf8'))
  zip.addFile(`aasx/${partName}`, Buffer.from(JSON.stringify(environment, null, 2), 'utf8'))
  return zip.toBuffer()
}

/** Inverse of packAasx (used by tests and future AASX import): parts by name and the parsed Environment. */
export function readAasx(buffer: Buffer): { entries: string[]; parts: Record<string, string>; environment: any } {
  const zip = new AdmZip(buffer)
  const parts: Record<string, string> = {}
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory) parts[entry.entryName] = entry.getData().toString('utf8')
  }
  const specName = Object.keys(parts).find((n) => n.startsWith('aasx/') && n.endsWith('.json'))
  const environment = specName ? JSON.parse(parts[specName]) : undefined
  return { entries: Object.keys(parts), parts, environment }
}

/** `<idShort>.aasx`, sanitised so the header stays a plain token. */
export function aasxFilename(idShort: unknown): string {
  return `${sanitizeIdShort(idShort, 'aas')}.aasx`
}

/** Send an Environment as an AASX download on a Fastify reply (same pattern as files.controller). */
export function sendAasx(reply: FastifyReply, environment: object, idShort: unknown): void {
  reply
    .status(200)
    .header('Content-Type', AASX_CONTENT_TYPE)
    .header('Content-Disposition', `attachment; filename="${aasxFilename(idShort)}"`)
    .send(packAasx(environment))
}
