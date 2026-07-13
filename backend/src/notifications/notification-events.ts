import { ROLE, type Role } from '@/auth/roles'
import type { DtEvent, DtEventType } from '@/events/event-broker.service'

/**
 * Semantic event catalog for per-user notifications.
 *
 * Raw `DtEvent`s emitted on the EventBroker are technical (e.g.
 * `node_status_changed` fires for *every* status transition). For the UI and
 * for per-user subscriptions we expose a small, stable set of *semantic* events
 * that are meaningful to a human and map deterministically from one or more raw
 * events + a discriminator (status / timeline action).
 *
 * This catalog is the single source of truth shared by:
 *   - the dispatcher (NotificationsService.mapToSemantic + recipient resolution)
 *   - the API (`GET /notifications/events`, filtered by the caller's role)
 *   - the frontend (friendly labels + descriptions + which events a role may pick)
 */

export type SemanticEventKey =
  | 'node.actionable'
  | 'iteration.completed'
  | 'node.advanced'
  | 'iteration.started'
  | 'file.access_requested'
  | 'file.access_decided'
  | 'file.saved'

/** Wildcard accepted in a subscription's eventTypes = "all events relevant to me". */
export const ALL_EVENTS = '*'

export interface NotificationEventDef {
  key: SemanticEventKey
  label: string
  description: string
  /** Roles offered this event in the UI (and allowed to subscribe to it). */
  roles: Role[]
  /** Raw DT event types that can produce this semantic event. */
  triggeredBy: DtEventType[]
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  {
    key: 'node.actionable',
    label: 'A node is waiting for your team',
    description:
      'A workflow node assigned to your partner has become actionable (PENDING) — you can claim it, upload its outputs or trigger it.',
    roles: [ROLE.OPERATOR, ROLE.OWNER, ROLE.SUPERADMIN],
    triggeredBy: ['node_status_changed'],
  },
  {
    key: 'iteration.completed',
    label: 'An iteration finished',
    description:
      'An iteration your partner is involved in has reached a terminal state (COMPLETED or FAILED).',
    roles: [ROLE.OPERATOR, ROLE.OWNER, ROLE.SUPERADMIN],
    triggeredBy: ['iteration_status'],
  },
  {
    key: 'node.advanced',
    label: 'A node advanced',
    description:
      'A node in one of your iterations completed and the workflow moved forward (oversight).',
    roles: [ROLE.OWNER, ROLE.SUPERADMIN],
    triggeredBy: ['node_status_changed'],
  },
  {
    key: 'iteration.started',
    label: 'An iteration started',
    description: 'A new iteration was created against one of your workflows (oversight).',
    roles: [ROLE.OWNER, ROLE.SUPERADMIN],
    triggeredBy: ['timeline_event'],
  },
  {
    key: 'file.access_requested',
    label: 'Someone requested file access',
    description:
      'A partner requested read access to a file in one of your products — you may approve or reject it.',
    roles: [ROLE.OWNER, ROLE.SUPERADMIN],
    triggeredBy: ['file_access_requested'],
  },
  {
    key: 'file.access_decided',
    label: 'Your file-access request was decided',
    description: 'A file-access request you raised was approved or rejected.',
    roles: [ROLE.OPERATOR, ROLE.OWNER, ROLE.SUPERADMIN],
    triggeredBy: ['file_access_decided'],
  },
  {
    key: 'file.saved',
    label: 'A file was uploaded',
    description: 'A file was uploaded anywhere on the platform (administrative oversight).',
    roles: [ROLE.SUPERADMIN],
    triggeredBy: ['file_saved'],
  },
]

const BY_KEY = new Map<SemanticEventKey, NotificationEventDef>(
  NOTIFICATION_EVENTS.map((e) => [e.key, e]),
)

export function getEventDef(key: SemanticEventKey): NotificationEventDef | undefined {
  return BY_KEY.get(key)
}

/** Catalog filtered to the events a given role may subscribe to. */
export function eventsForRole(role: Role): NotificationEventDef[] {
  return NOTIFICATION_EVENTS.filter((e) => e.roles.includes(role))
}

/** True if `role` is allowed to subscribe to `key`. */
export function roleMaySubscribe(role: Role, key: string): boolean {
  if (key === ALL_EVENTS) return true
  const def = BY_KEY.get(key as SemanticEventKey)
  return !!def && def.roles.includes(role)
}

/**
 * Translate a raw broker event into the semantic event key it represents,
 * applying the status/action discriminator. Returns null for raw events that
 * are not user-facing notifications (node_progress, node_log, ingest_unassigned,
 * file_enriched, and gateway COMPLETED/SKIPPED transitions other than the ones
 * mapped below).
 */
export function mapToSemantic(evt: DtEvent): SemanticEventKey | null {
  const p = (evt.payload ?? {}) as Record<string, unknown>
  switch (evt.type) {
    case 'node_status_changed': {
      const status = String(p.status ?? '')
      if (status === 'PENDING') return 'node.actionable'
      if (status === 'COMPLETED') return 'node.advanced'
      return null
    }
    case 'iteration_status': {
      const status = String(p.status ?? '')
      if (status === 'COMPLETED' || status === 'FAILED') return 'iteration.completed'
      return null
    }
    case 'timeline_event': {
      const action = String(p.action ?? '')
      if (action === 'ITERATION_STARTED') return 'iteration.started'
      return null
    }
    case 'file_access_requested':
      return 'file.access_requested'
    case 'file_access_decided':
      return 'file.access_decided'
    case 'file_saved':
      return 'file.saved'
    default:
      return null
  }
}
