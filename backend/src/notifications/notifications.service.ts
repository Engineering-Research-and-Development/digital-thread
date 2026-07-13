import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import * as crypto from 'crypto'
import * as nodemailer from 'nodemailer'
import { PrismaService } from '@/database/prisma.service'
import { EventBrokerService, type DtEvent } from '@/events/event-broker.service'
import { SecretsService } from '@/common/security/secrets.service'
import { FilesService } from '@/files/files.service'
import { ROLE, type Role } from '@/auth/roles'
import { normalizeNodesJson } from '@/iterations/normalize-node'
import {
  ALL_EVENTS,
  eventsForRole,
  mapToSemantic,
  roleMaySubscribe,
  type SemanticEventKey,
} from './notification-events'
import { AppConfigService } from './app-config.service'

type Channel = 'WEBHOOK' | 'EMAIL'
type AuthType = 'NONE' | 'API_KEY' | 'OAUTH2'

interface CurrentUser {
  id: string
  email: string
  role: Role
  partnerId?: string | null
}

interface CreateSubscriptionInput {
  kind: Channel
  eventTypes: string[]
  target: string
  label?: string
  secret?: string
  authType?: AuthType
  authConfig?: Record<string, any>
}

/** Resolved per-event context used for recipient resolution + payload building. */
interface EventContext {
  semanticKey: SemanticEventKey
  rawType: string
  iteration?: {
    id: string
    displayId: string
    status: string
    machineId: string
    machineName: string
    versionNumber: number | null
    stateMachineVersionId: string | null
    ownerPartnerId: string | null
    productId: string | null
    productUrn?: string | null
    productName?: string | null
  }
  node?: {
    id: string
    name: string
    status: string
    responsiblePartnerIds: string[]
    responsiblePartnerNames: string[]
  }
  file?: any // Prisma FileRecord
  accessRequest?: {
    id: string
    requesterId: string
    requesterPartnerId?: string | null
    decision?: string
    grantExpiresAt?: string | null
  }
  /** Partner ids responsible on any node of the iteration (for oversight events). */
  involvedPartnerIds: string[]
}

const WEBHOOK_TIMEOUT_MS = 10_000
/** Delays BEFORE attempt 2 and attempt 3 (attempt 1 is immediate). */
const RETRY_BACKOFF_MS = [5_000, 30_000]
const MAX_ATTEMPTS = 3

/**
 * NotificationsService — per-user notifications.
 *
 * Subscribes to the in-process EventBroker, translates each raw `DtEvent` into a
 * semantic event (notification-events.ts), resolves the *relevant* recipient
 * users (by node responsibility / iteration ownership / decider role), and for
 * each recipient who has a matching enabled subscription delivers a
 * permission-filtered payload — EMAIL (natural-language summary via SMTP) or
 * WEBHOOK (rich JSON, signed/authenticated) — recording the outcome in
 * `NotificationDelivery` (which also backs the per-user history view) and
 * retrying transient failures with exponential backoff.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name)
  /** OAuth2 client_credentials token cache, keyed by subscription id. */
  private oauthCache = new Map<string, { token: string; exp: number }>()

  constructor(
    private prisma: PrismaService,
    private broker: EventBrokerService,
    private secrets: SecretsService,
    private files: FilesService,
    private appConfig: AppConfigService,
  ) {}

  onModuleInit() {
    this.broker.subscribeAll((evt) => {
      this.handleRawEvent(evt).catch((e) => this.logger.warn(`notification dispatch failed: ${e?.message}`))
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Dispatch pipeline
  // ──────────────────────────────────────────────────────────────────────────

  private async handleRawEvent(evt: DtEvent) {
    const key = mapToSemantic(evt)
    if (!key) return
    const ctx = await this.buildContext(evt, key)
    if (!ctx) return
    const recipients = await this.resolveRecipients(key, ctx)
    if (recipients.length === 0) return

    for (const recipient of recipients) {
      const subs = await this.prisma.notificationSubscription.findMany({
        where: { userId: recipient.id, enabled: true },
      })
      for (const sub of subs) {
        const types: string[] = safeParseArray(sub.eventTypes)
        if (!types.includes(key) && !types.includes(ALL_EVENTS)) continue
        this.dispatchToSubscription(sub, recipient, ctx).catch((e) =>
          this.logger.warn(`deliver to ${sub.id} failed: ${e?.message}`),
        )
      }
    }
  }

  /** Build the enriched context from the raw event, loading DB data directly. */
  private async buildContext(evt: DtEvent, key: SemanticEventKey): Promise<EventContext | null> {
    const payload = (evt.payload ?? {}) as Record<string, any>
    const ctx: EventContext = { semanticKey: key, rawType: evt.type, involvedPartnerIds: [] }

    // File events — derive the *real* iteration from the FileRecord, not from
    // evt.iterationId (file_access_decided emits iterationId === fileId).
    let iterationId: string | null = null
    if (payload.fileId) {
      const file = await this.prisma.fileRecord.findUnique({ where: { id: String(payload.fileId) } })
      if (file) {
        ctx.file = file
        iterationId = file.iterationId ?? null
      }
    }
    if (payload.requestId) {
      const ar = await this.prisma.fileAccessRequest.findUnique({
        where: { id: String(payload.requestId) },
        include: { file: true },
      })
      if (ar) {
        ctx.accessRequest = {
          id: ar.id,
          requesterId: ar.requesterId,
          requesterPartnerId: ar.requesterPartnerId,
          decision: payload.decision ? String(payload.decision) : undefined,
          grantExpiresAt: ar.grantExpiresAt ? ar.grantExpiresAt.toISOString() : null,
        }
        if (!ctx.file && ar.file) ctx.file = ar.file
        if (!iterationId) iterationId = ar.file?.iterationId ?? null
      }
    }
    if (!iterationId && evt.iterationId && evt.iterationId !== 'raw' && evt.iterationId !== 'global') {
      iterationId = evt.iterationId
    }

    if (iterationId) {
      const iter = await this.prisma.iteration.findUnique({
        where: { id: iterationId },
        include: { stateMachineVersion: true, machine: true, product: true },
      })
      if (iter) {
        ctx.iteration = {
          id: iter.id,
          displayId: iter.displayId,
          status: iter.status,
          machineId: iter.machineId,
          machineName: iter.machineName,
          versionNumber: iter.stateMachineVersion?.versionNumber ?? null,
          stateMachineVersionId: iter.stateMachineVersionId,
          ownerPartnerId: iter.ownerPartnerId,
          productId: iter.productId,
          productUrn: iter.product?.urn ?? null,
          productName: iter.product?.name ?? null,
        }

        // Resolve node responsibility from the frozen workflow version the
        // iteration ran against, not the live (editable) head version.
        const sourceJson = iter.stateMachineVersion?.nodesJson ?? iter.machine?.nodesJson ?? '[]'
        const nodes = normalizeNodesJson(sourceJson)
        ctx.involvedPartnerIds = await this.collectInvolvedPartnerIds(nodes)

        const nodeId = payload.nodeId ? String(payload.nodeId) : null
        if (nodeId) {
          const raw = nodes.find((n: any) => n.id === nodeId)
          if (raw) {
            const ids = await this.resolvePartnerIds(raw)
            ctx.node = {
              id: raw.id,
              name: raw.name ?? raw.label ?? raw.id,
              status: payload.status ? String(payload.status) : '',
              responsiblePartnerIds: ids,
              responsiblePartnerNames: await this.partnerNames(ids),
            }
          }
        }
      }
    }

    return ctx
  }

  /** Resolve a node's responsible partner ids (array + legacy name → id). */
  private async resolvePartnerIds(node: any): Promise<string[]> {
    const ids = new Set<string>((node.responsiblePartnerIds ?? []).filter(Boolean))
    const legacyName: string | undefined = node.responsiblePartner
    if (legacyName) {
      const p = await this.prisma.partner.findFirst({ where: { name: legacyName }, select: { id: true } })
      if (p) ids.add(p.id)
    }
    return [...ids]
  }

  private async collectInvolvedPartnerIds(nodes: any[]): Promise<string[]> {
    const all = new Set<string>()
    for (const n of nodes) {
      for (const id of await this.resolvePartnerIds(n)) all.add(id)
    }
    return [...all]
  }

  private async partnerNames(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const partners = await this.prisma.partner.findMany({ where: { id: { in: ids } }, select: { name: true } })
    return partners.map((p) => p.name)
  }

  /** Resolve the candidate recipient users for a semantic event. */
  private async resolveRecipients(key: SemanticEventKey, ctx: EventContext): Promise<any[]> {
    const byId = new Map<string, any>()
    const add = (users: any[]) => users.forEach((u) => byId.set(u.id, u))

    switch (key) {
      case 'node.actionable': {
        const ids = ctx.node?.responsiblePartnerIds ?? []
        if (ids.length) add(await this.usersByPartnerIds(ids))
        add(await this.superadmins())
        break
      }
      case 'iteration.completed': {
        const ids = this.iterationPartnerIds(ctx)
        if (ids.length) add(await this.usersByPartnerIds(ids))
        add(await this.superadmins())
        break
      }
      case 'node.advanced':
      case 'iteration.started': {
        // Oversight — owners of involved/owning partners + superadmins.
        const ids = this.iterationPartnerIds(ctx)
        if (ids.length) add(await this.usersByPartnerIds(ids, [ROLE.OWNER]))
        add(await this.superadmins())
        break
      }
      case 'file.access_requested': {
        // Deciders: superadmins + owners of the partner that owns the file's
        // product (mirrors FileAccessRequestsService scope). Fall back to the
        // iteration's owner partner when there is no product.
        add(await this.superadmins())
        const ownerPartnerId = await this.fileProductOwnerPartnerId(ctx)
        if (ownerPartnerId) add(await this.usersByPartnerIds([ownerPartnerId], [ROLE.OWNER]))
        break
      }
      case 'file.access_decided': {
        // The requester (any role) + superadmins.
        if (ctx.accessRequest?.requesterId) {
          const u = await this.prisma.user.findUnique({ where: { id: ctx.accessRequest.requesterId } })
          if (u && u.isActive) add([u])
        }
        add(await this.superadmins())
        break
      }
      case 'file.saved': {
        add(await this.superadmins())
        break
      }
    }
    return [...byId.values()]
  }

  private iterationPartnerIds(ctx: EventContext): string[] {
    const ids = new Set<string>(ctx.involvedPartnerIds)
    if (ctx.iteration?.ownerPartnerId) ids.add(ctx.iteration.ownerPartnerId)
    return [...ids]
  }

  private async fileProductOwnerPartnerId(ctx: EventContext): Promise<string | null> {
    if (ctx.iteration?.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: ctx.iteration.productId },
        select: { ownerPartnerId: true },
      })
      if (product) return product.ownerPartnerId
    }
    return ctx.iteration?.ownerPartnerId ?? null
  }

  private async usersByPartnerIds(partnerIds: string[], roles?: Role[]): Promise<any[]> {
    if (partnerIds.length === 0) return []
    const where: any = { partnerId: { in: partnerIds }, isActive: true }
    if (roles && roles.length) where.role = { in: roles }
    return this.prisma.user.findMany({ where })
  }

  private async superadmins(): Promise<any[]> {
    return this.prisma.user.findMany({ where: { role: ROLE.SUPERADMIN, isActive: true } })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Delivery
  // ──────────────────────────────────────────────────────────────────────────

  private async dispatchToSubscription(sub: any, recipient: any, ctx: EventContext) {
    const deliveryId = crypto.randomUUID()
    const readableFile = ctx.file ? await this.fileReadableFor(ctx.file, recipient) : true
    const email = this.renderEmail(ctx, recipient, readableFile)
    const webhookPayload = this.buildWebhookPayload(ctx, deliveryId, readableFile)

    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        id: deliveryId,
        subscriptionId: sub.id,
        recipientUserId: recipient.id,
        eventType: ctx.rawType,
        eventKey: ctx.semanticKey,
        summary: email.subject,
        payloadJson: JSON.stringify(webhookPayload),
        status: 'PENDING',
      },
    })

    const attemptFn =
      sub.kind === 'EMAIL'
        ? () => this.sendEmail(sub, email)
        : () => this.sendWebhook(sub, webhookPayload, ctx.semanticKey, deliveryId)

    await this.deliverWithRetry(delivery.id, attemptFn, 1)
  }

  /**
   * Run an attempt, persist its outcome, and reschedule on transient failure
   * (network error / timeout / 5xx / 429) up to MAX_ATTEMPTS. Non-blocking.
   */
  private async deliverWithRetry(
    deliveryId: string,
    attemptFn: () => Promise<DeliveryResult>,
    attempt: number,
  ) {
    let res: DeliveryResult
    try {
      res = await attemptFn()
    } catch (e: any) {
      res = { ok: false, error: e?.message ?? 'delivery error', retriable: true }
    }
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        attempt,
        status: res.ok ? 'OK' : 'ERROR',
        httpStatus: res.httpStatus ?? null,
        errorMsg: res.ok ? null : (res.error ?? 'delivery failed'),
      },
    })
    if (!res.ok && res.retriable && attempt < MAX_ATTEMPTS) {
      const delay = RETRY_BACKOFF_MS[attempt - 1] ?? 60_000
      setTimeout(() => {
        this.deliverWithRetry(deliveryId, attemptFn, attempt + 1).catch((e) =>
          this.logger.warn(`retry ${attempt + 1} for ${deliveryId} failed: ${e?.message}`),
        )
      }, delay).unref?.()
    }
  }

  private async sendWebhook(
    sub: any,
    payload: any,
    eventKey: string,
    deliveryId: string,
  ): Promise<DeliveryResult> {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-DT-Event-Type': eventKey,
      'X-DT-Delivery-Id': deliveryId,
    }
    if (sub.secret) {
      headers['X-DT-Signature'] = 'sha256=' + crypto.createHmac('sha256', sub.secret).update(body).digest('hex')
    }
    try {
      await this.applyAuthHeaders(sub, headers)
    } catch (e: any) {
      return { ok: false, error: `auth failed: ${e?.message}`, retriable: true }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
    try {
      const res = await fetch(sub.target, { method: 'POST', headers, body, signal: controller.signal })
      const retriable = res.status >= 500 || res.status === 429
      return {
        ok: res.ok,
        httpStatus: res.status,
        error: res.ok ? undefined : `HTTP ${res.status}`,
        retriable: res.ok ? false : retriable,
      }
    } catch (e: any) {
      const aborted = e?.name === 'AbortError'
      return { ok: false, error: aborted ? 'timeout' : (e?.message ?? 'fetch failed'), retriable: true }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Apply the configured webhook auth header(s). */
  private async applyAuthHeaders(sub: any, headers: Record<string, string>) {
    const authType: AuthType = sub.authType ?? 'NONE'
    if (authType === 'NONE' || !sub.authConfigJson) return
    const cfg = JSON.parse(this.secrets.decrypt(sub.authConfigJson))
    if (authType === 'API_KEY') {
      if (cfg.headerName && cfg.headerValue) headers[cfg.headerName] = cfg.headerValue
    } else if (authType === 'OAUTH2') {
      headers['Authorization'] = `Bearer ${await this.getOAuthToken(sub.id, cfg)}`
    }
  }

  /** OAuth2 client_credentials token, cached per subscription until ~60s before expiry. */
  private async getOAuthToken(subId: string, cfg: any): Promise<string> {
    const cached = this.oauthCache.get(subId)
    if (cached && cached.exp > Date.now()) return cached.token

    const form = new URLSearchParams()
    form.set('grant_type', 'client_credentials')
    form.set('client_id', cfg.clientId)
    form.set('client_secret', cfg.clientSecret)
    if (cfg.scope) form.set('scope', cfg.scope)
    if (cfg.audience) form.set('audience', cfg.audience)

    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    })
    if (!res.ok) throw new Error(`token endpoint HTTP ${res.status}`)
    const json: any = await res.json()
    const token = json.access_token
    if (!token) throw new Error('no access_token in token response')
    const ttl = Number(json.expires_in ?? 300)
    this.oauthCache.set(subId, { token, exp: Date.now() + Math.max(ttl - 60, 30) * 1000 })
    return token
  }

  private async sendEmail(sub: any, email: { subject: string; text: string }): Promise<DeliveryResult> {
    const transport = await this.buildSmtpTransport()
    if (!transport) return { ok: false, error: 'SMTP not configured', retriable: false }
    try {
      await transport.transport.sendMail({ from: transport.from, to: sub.target, subject: email.subject, text: email.text })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'email send failed', retriable: true }
    }
  }

  /** Build a nodemailer transport from DB config, falling back to SMTP_URL. */
  private async buildSmtpTransport(): Promise<{ transport: nodemailer.Transporter; from: string } | null> {
    const cfg = await this.appConfig.getSmtpRaw()
    if (cfg && cfg.host) {
      const transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
      })
      const from = cfg.fromName ? `"${cfg.fromName}" <${cfg.fromAddress}>` : cfg.fromAddress
      return { transport, from }
    }
    if (process.env.SMTP_URL) {
      const transport = nodemailer.createTransport(process.env.SMTP_URL)
      return { transport, from: process.env.SMTP_FROM ?? 'noreply@digital-thread.local' }
    }
    return null
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Permission filtering + payload rendering
  // ──────────────────────────────────────────────────────────────────────────

  private async fileReadableFor(file: any, recipient: any): Promise<boolean> {
    try {
      return await this.files.canRead(file, {
        id: recipient.id,
        role: recipient.role,
        partnerId: recipient.partnerId ?? undefined,
      })
    } catch {
      return false
    }
  }

  /** File subset for webhooks, redacted when the recipient may not read it. */
  private filePayload(file: any, readable: boolean) {
    if (!file) return undefined
    const base = {
      id: file.id,
      filename: file.filename,
      classification: file.classification,
      iterationId: file.iterationId ?? null,
      nodeSourceId: file.nodeSourceId ?? null,
      nodeOutputId: file.nodeOutputId ?? null,
      readable,
    }
    if (!readable) return base
    return {
      ...base,
      path: file.path,
      bucket: file.bucket,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      contentHash: file.contentHash ?? null,
      version: file.version,
      partnerId: file.partnerId ?? null,
    }
  }

  private buildWebhookPayload(ctx: EventContext, deliveryId: string, readableFile: boolean) {
    return {
      event: ctx.semanticKey,
      rawEvent: ctx.rawType,
      deliveryId,
      timestamp: new Date().toISOString(),
      iteration: ctx.iteration
        ? {
            id: ctx.iteration.id,
            displayId: ctx.iteration.displayId,
            status: ctx.iteration.status,
            stateMachineId: ctx.iteration.machineId,
            stateMachineName: ctx.iteration.machineName,
            stateMachineVersionId: ctx.iteration.stateMachineVersionId,
            versionNumber: ctx.iteration.versionNumber,
            ownerPartnerId: ctx.iteration.ownerPartnerId,
            productId: ctx.iteration.productId,
            productUrn: ctx.iteration.productUrn ?? null,
            productName: ctx.iteration.productName ?? null,
          }
        : undefined,
      node: ctx.node
        ? {
            id: ctx.node.id,
            name: ctx.node.name,
            status: ctx.node.status,
            responsiblePartnerIds: ctx.node.responsiblePartnerIds,
            responsiblePartnerNames: ctx.node.responsiblePartnerNames,
          }
        : undefined,
      file: this.filePayload(ctx.file, readableFile),
      accessRequest: ctx.accessRequest
        ? {
            id: ctx.accessRequest.id,
            requesterId: ctx.accessRequest.requesterId,
            requesterPartnerId: ctx.accessRequest.requesterPartnerId ?? null,
            decision: ctx.accessRequest.decision ?? null,
            grantExpiresAt: ctx.accessRequest.grantExpiresAt ?? null,
          }
        : undefined,
    }
  }

  /** Natural-language email summary per semantic event. */
  private renderEmail(ctx: EventContext, recipient: any, readableFile: boolean): { subject: string; text: string } {
    const iter = ctx.iteration
    const node = ctx.node
    const partner = node?.responsiblePartnerNames?.join(', ') || 'your team'
    const greet = recipient.fullName ? `Hi ${recipient.fullName},` : 'Hello,'
    const sign = '\n\n— Digital Thread Platform'

    switch (ctx.semanticKey) {
      case 'node.actionable':
        return {
          subject: `[Digital Thread] Action needed: "${node?.name}" in ${iter?.displayId}`,
          text: `${greet}\n\nThe node "${node?.name}" in iteration ${iter?.displayId} (workflow "${iter?.machineName}") is now waiting for ${partner} to act. Please claim it, upload its outputs or trigger it in the platform.${sign}`,
        }
      case 'iteration.completed':
        return {
          subject: `[Digital Thread] Iteration ${iter?.displayId} ${iter?.status === 'FAILED' ? 'failed' : 'completed'}`,
          text: `${greet}\n\nIteration ${iter?.displayId} of workflow "${iter?.machineName}" has finished with status ${iter?.status}.${sign}`,
        }
      case 'node.advanced':
        return {
          subject: `[Digital Thread] Node "${node?.name}" completed in ${iter?.displayId}`,
          text: `${greet}\n\nThe node "${node?.name}" completed in iteration ${iter?.displayId} (workflow "${iter?.machineName}") and the workflow advanced.${sign}`,
        }
      case 'iteration.started':
        return {
          subject: `[Digital Thread] Iteration ${iter?.displayId} started`,
          text: `${greet}\n\nA new iteration ${iter?.displayId} of workflow "${iter?.machineName}" has been created.${sign}`,
        }
      case 'file.access_requested':
        return {
          subject: `[Digital Thread] File-access request for "${ctx.file?.filename}"`,
          text: `${greet}\n\nA partner requested read access to the file "${ctx.file?.filename}" (classification ${ctx.file?.classification})${iter ? ` used in iteration ${iter.displayId}` : ''}. Review it in Governance.${sign}`,
        }
      case 'file.access_decided':
        return {
          subject: `[Digital Thread] Your access request for "${ctx.file?.filename}" was ${ctx.accessRequest?.decision === 'APPROVE' ? 'approved' : 'decided'}`,
          text: `${greet}\n\nYour request to access "${ctx.file?.filename}" was ${ctx.accessRequest?.decision === 'APPROVE' ? `APPROVED${ctx.accessRequest?.grantExpiresAt ? ` (until ${ctx.accessRequest.grantExpiresAt})` : ''}` : 'REJECTED'}.${sign}`,
        }
      case 'file.saved':
        return {
          subject: `[Digital Thread] File uploaded: "${ctx.file?.filename}"`,
          text: `${greet}\n\nA file "${ctx.file?.filename}" (classification ${ctx.file?.classification})${iter ? ` was uploaded in iteration ${iter.displayId}` : ' was uploaded'}.${sign}`,
        }
      default:
        return { subject: '[Digital Thread] Notification', text: `${greet}${sign}` }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Subscription management (per-user)
  // ──────────────────────────────────────────────────────────────────────────

  async listSubscriptions(user: CurrentUser) {
    const subs = await this.prisma.notificationSubscription.findMany({
      where: user.role === ROLE.SUPERADMIN ? {} : { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return subs.map((s) => this.toPublic(s))
  }

  async createSubscription(user: CurrentUser, input: CreateSubscriptionInput) {
    this.validateInput(user, input)
    const data: any = {
      userId: user.id,
      kind: input.kind,
      label: input.label?.slice(0, 200) ?? null,
      eventTypes: JSON.stringify(input.eventTypes),
      target: input.target,
      secret: input.secret || null,
      authType: input.kind === 'WEBHOOK' ? (input.authType ?? 'NONE') : 'NONE',
      authConfigJson: null,
    }
    if (data.authType !== 'NONE') {
      data.authConfigJson = this.secrets.encrypt(JSON.stringify(this.normalizeAuthConfig(data.authType, input.authConfig)))
    }
    const created = await this.prisma.notificationSubscription.create({ data })
    return this.toPublic(created)
  }

  async updateSubscription(
    user: CurrentUser,
    id: string,
    input: Partial<CreateSubscriptionInput> & { enabled?: boolean },
  ) {
    const sub = await this.ownedSub(user, id)
    const data: any = {}
    if (input.label !== undefined) data.label = input.label?.slice(0, 200) ?? null
    if (input.target !== undefined) data.target = input.target
    if (input.secret !== undefined) data.secret = input.secret || null
    if (input.enabled !== undefined) data.enabled = input.enabled
    if (input.eventTypes !== undefined) {
      this.validateEventTypes(user, input.eventTypes)
      data.eventTypes = JSON.stringify(input.eventTypes)
    }
    if (input.kind !== undefined) data.kind = input.kind
    const nextKind: Channel = (data.kind ?? sub.kind) as Channel
    if (input.authType !== undefined || input.authConfig !== undefined) {
      const authType: AuthType = nextKind === 'WEBHOOK' ? (input.authType ?? (sub.authType as AuthType) ?? 'NONE') : 'NONE'
      data.authType = authType
      if (authType === 'NONE') {
        data.authConfigJson = null
      } else if (input.authConfig !== undefined) {
        // Merge with the existing (decrypted) config so the secret can be kept.
        const existing = sub.authConfigJson ? JSON.parse(this.secrets.decrypt(sub.authConfigJson)) : {}
        const merged = this.normalizeAuthConfig(authType, { ...existing, ...input.authConfig }, existing)
        data.authConfigJson = this.secrets.encrypt(JSON.stringify(merged))
      }
    } else if (input.kind === 'EMAIL') {
      data.authType = 'NONE'
      data.authConfigJson = null
    }
    const updated = await this.prisma.notificationSubscription.update({ where: { id }, data })
    return this.toPublic(updated)
  }

  async removeSubscription(user: CurrentUser, id: string) {
    await this.ownedSub(user, id)
    await this.prisma.notificationSubscription.delete({ where: { id } })
    return { ok: true }
  }

  /** Send a synthetic notification through a subscription to verify it works. */
  async testSubscription(user: CurrentUser, id: string) {
    const sub = await this.ownedSub(user, id)
    const deliveryId = crypto.randomUUID()
    const subject = '[Digital Thread] Test notification'
    const text = `Hello,\n\nThis is a test notification from the Digital Thread platform confirming your "${sub.label ?? sub.kind}" channel works.\n\n— Digital Thread Platform`
    const payload = {
      event: 'test',
      deliveryId,
      timestamp: new Date().toISOString(),
      message: 'Test notification from the Digital Thread platform.',
      subscriptionId: sub.id,
    }
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        id: deliveryId,
        subscriptionId: sub.id,
        recipientUserId: user.id,
        eventType: 'test',
        eventKey: 'test',
        summary: subject,
        payloadJson: JSON.stringify(payload),
        status: 'PENDING',
      },
    })
    const attemptFn =
      sub.kind === 'EMAIL'
        ? () => this.sendEmail(sub, { subject, text })
        : () => this.sendWebhook(sub, payload, 'test', deliveryId)
    const res = await attemptFn().catch((e) => ({ ok: false, error: e?.message } as DeliveryResult))
    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: res.ok ? 'OK' : 'ERROR',
        httpStatus: res.httpStatus ?? null,
        errorMsg: res.ok ? null : (res.error ?? 'failed'),
      },
    })
    if (!res.ok) throw new BadRequestException(`Test delivery failed: ${res.error ?? 'unknown error'}`)
    return { ok: true, deliveryId }
  }

  async history(
    user: CurrentUser,
    opts: { limit?: number; offset?: number; status?: string; eventKey?: string; all?: boolean } = {},
  ) {
    const where: any = {}
    if (!(opts.all && user.role === ROLE.SUPERADMIN)) where.recipientUserId = user.id
    if (opts.status) where.status = opts.status
    if (opts.eventKey) where.eventKey = opts.eventKey
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 200)
    const skip = Math.max(opts.offset ?? 0, 0)
    const [items, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take,
        include: { subscription: { select: { id: true, kind: true, target: true, label: true } } },
      }),
      this.prisma.notificationDelivery.count({ where }),
    ])
    return { items, total, limit: take, offset: skip }
  }

  catalogForRole(role: Role) {
    return eventsForRole(role).map(({ key, label, description }) => ({ key, label, description }))
  }

  // ─── SMTP admin (SUPERADMIN) ──────────────────────────────────────────────

  getSmtp() {
    return this.appConfig.getSmtpPublic()
  }

  saveSmtp(input: any, userId: string) {
    return this.appConfig.setSmtp(
      {
        host: input.host,
        port: input.port !== undefined ? Number(input.port) : undefined,
        secure: input.secure,
        username: input.username,
        password: input.password,
        fromAddress: input.fromAddress,
        fromName: input.fromName,
      },
      userId,
    )
  }

  async testSmtp(to: string) {
    const transport = await this.buildSmtpTransport()
    if (!transport) throw new BadRequestException('SMTP is not configured')
    try {
      await transport.transport.sendMail({
        from: transport.from,
        to,
        subject: '[Digital Thread] SMTP test',
        text: 'This is a test email confirming the Digital Thread SMTP configuration works.',
      })
      return { ok: true }
    } catch (e: any) {
      throw new BadRequestException(`SMTP test failed: ${e?.message ?? 'send error'}`)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async ownedSub(user: CurrentUser, id: string) {
    const sub = await this.prisma.notificationSubscription.findUnique({ where: { id } })
    if (!sub) throw new NotFoundException('Subscription not found')
    if (user.role !== ROLE.SUPERADMIN && sub.userId !== user.id) {
      throw new ForbiddenException('Not your subscription')
    }
    return sub
  }

  private validateInput(user: CurrentUser, input: CreateSubscriptionInput) {
    if (input.kind !== 'WEBHOOK' && input.kind !== 'EMAIL') throw new BadRequestException('kind must be WEBHOOK or EMAIL')
    if (!input.target?.trim()) throw new BadRequestException('target is required')
    if (input.kind === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.target)) {
      throw new BadRequestException('target must be a valid email address')
    }
    if (input.kind === 'WEBHOOK' && !/^https?:\/\//i.test(input.target)) {
      throw new BadRequestException('target must be an http(s) URL')
    }
    this.validateEventTypes(user, input.eventTypes)
    if (input.kind === 'WEBHOOK' && input.authType && input.authType !== 'NONE') {
      this.normalizeAuthConfig(input.authType, input.authConfig)
    }
  }

  private validateEventTypes(user: CurrentUser, eventTypes: string[]) {
    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      throw new BadRequestException('eventTypes must be a non-empty array')
    }
    for (const key of eventTypes) {
      if (!roleMaySubscribe(user.role, key)) {
        throw new BadRequestException(`Event "${key}" is not available to your role`)
      }
    }
  }

  /** Validate + shape the auth config blob, preserving secrets from `existing`. */
  private normalizeAuthConfig(authType: AuthType, cfg: any = {}, existing: any = {}): Record<string, any> {
    if (authType === 'API_KEY') {
      const headerName = cfg.headerName ?? existing.headerName
      const headerValue = cfg.headerValue || existing.headerValue
      if (!headerName) throw new BadRequestException('API key auth requires a headerName')
      if (!headerValue) throw new BadRequestException('API key auth requires a headerValue')
      return { headerName, headerValue }
    }
    if (authType === 'OAUTH2') {
      const tokenUrl = cfg.tokenUrl ?? existing.tokenUrl
      const clientId = cfg.clientId ?? existing.clientId
      const clientSecret = cfg.clientSecret || existing.clientSecret
      if (!tokenUrl || !/^https?:\/\//i.test(tokenUrl)) throw new BadRequestException('OAuth2 requires a valid tokenUrl')
      if (!clientId) throw new BadRequestException('OAuth2 requires a clientId')
      if (!clientSecret) throw new BadRequestException('OAuth2 requires a clientSecret')
      return {
        tokenUrl,
        clientId,
        clientSecret,
        scope: cfg.scope ?? existing.scope,
        audience: cfg.audience ?? existing.audience,
      }
    }
    return {}
  }

  /** Public projection of a subscription — never exposes secret material. */
  private toPublic(sub: any) {
    let auth: any = { type: sub.authType ?? 'NONE' }
    if (sub.authConfigJson && sub.authType && sub.authType !== 'NONE') {
      try {
        const cfg = JSON.parse(this.secrets.decrypt(sub.authConfigJson))
        if (sub.authType === 'API_KEY') {
          auth = { type: 'API_KEY', headerName: cfg.headerName, hasHeaderValue: !!cfg.headerValue }
        } else if (sub.authType === 'OAUTH2') {
          auth = {
            type: 'OAUTH2',
            tokenUrl: cfg.tokenUrl,
            clientId: cfg.clientId,
            scope: cfg.scope ?? null,
            audience: cfg.audience ?? null,
            hasClientSecret: !!cfg.clientSecret,
          }
        }
      } catch {
        /* leave auth as type only */
      }
    }
    return {
      id: sub.id,
      userId: sub.userId,
      label: sub.label,
      kind: sub.kind,
      eventTypes: safeParseArray(sub.eventTypes),
      target: sub.target,
      hasSecret: !!sub.secret,
      auth,
      enabled: sub.enabled,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    }
  }
}

interface DeliveryResult {
  ok: boolean
  httpStatus?: number
  error?: string
  retriable?: boolean
}

function safeParseArray(s: string | null | undefined): string[] {
  try {
    const v = JSON.parse(s || '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
