import type { Connection } from '@xyflow/react'

const CONNECT_EVENT = 'rf:external-connect'
const DISCONNECT_EVENT = 'rf:external-disconnect'

export interface DisconnectPayload {
  source: string
  target: string
}

// --- Creazione arco ---
export function emitConnect(connection: Connection) {
  window.dispatchEvent(new CustomEvent<Connection>(CONNECT_EVENT, { detail: connection }))
}

export function subscribeConnect(handler: (connection: Connection) => void) {
  const listener = (e: Event) => {
    handler((e as CustomEvent<Connection>).detail)
  }
  window.addEventListener(CONNECT_EVENT, listener)
  return () => window.removeEventListener(CONNECT_EVENT, listener)
}

// --- Eliminazione arco ---
export function emitDisconnect(payload: DisconnectPayload) {
  window.dispatchEvent(new CustomEvent<DisconnectPayload>(DISCONNECT_EVENT, { detail: payload }))
}

export function subscribeDisconnect(handler: (payload: DisconnectPayload) => void) {
  const listener = (e: Event) => {
    handler((e as CustomEvent<DisconnectPayload>).detail)
  }
  window.addEventListener(DISCONNECT_EVENT, listener)
  return () => window.removeEventListener(DISCONNECT_EVENT, listener)
}