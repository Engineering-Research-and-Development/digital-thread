export interface TagMapping {
  sourcePath: string
  targetInputId: string
  transform?: string
}

export interface IConnectivityAdapter {
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>
  fetchLatest(tagMapping: TagMapping[]): Promise<Record<string, unknown>>
  subscribe?(tagMapping: TagMapping[], callback: (data: Record<string, unknown>) => void): () => void
}
