import { IConnectivityAdapter, TagMapping } from './connectivity.interface'

/**
 * SQL DataSource adapter.
 *
 * Read-only, parameterised queries. Supports `:param` placeholders bound from
 * `protocolConfig.parameters`. Connects through a thin driver layer that is
 * loaded lazily — if the corresponding driver module isn't installed (e.g.
 * `pg`, `mysql2`, `better-sqlite3`), `testConnection` reports OFFLINE with a
 * clear reason and `fetchLatest` throws. This keeps the DT itself dep-free;
 * ops install the driver(s) they need.
 */
export class SqlAdapter implements IConnectivityAdapter {
  constructor(
    private endpoint: string,
    private authConfig: any,
    private protocolConfig: any,
  ) {}

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    try {
      const driver = this.loadDriver()
      if (!driver) return { ok: false, error: 'no SQL driver available for protocol' }
      const started = Date.now()
      await driver.ping()
      return { ok: true, latencyMs: Date.now() - started }
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'unknown SQL error' }
    }
  }

  async fetchLatest(_tagMapping: TagMapping[]): Promise<Record<string, unknown>> {
    const driver = this.loadDriver()
    if (!driver) throw new Error('SQL driver not installed')
    const query: string | undefined = this.protocolConfig?.query
    if (!query) throw new Error('protocolConfig.query required for SQL adapter')
    const params = this.protocolConfig?.parameters ?? {}
    const rows = await driver.query(query, params)
    return { rows }
  }

  /**
   * Minimal dynamic driver loader. Returns `null` when the relevant npm
   * package is not installed — callers can still pass `testConnection` but
   * `fetchLatest` will throw.
   */
  private loadDriver(): { query: (sql: string, params: any) => Promise<any[]>; ping: () => Promise<void> } | null {
    const driverName = (this.protocolConfig?.driver ?? 'postgresql').toLowerCase()
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const req = eval('require')
      if (driverName === 'postgresql' || driverName === 'postgres') {
        const { Client } = req('pg')
        return this.pgDriver(Client)
      }
      if (driverName === 'mysql' || driverName === 'mariadb') {
        const mysql = req('mysql2/promise')
        return this.mysqlDriver(mysql)
      }
      if (driverName === 'sqlite') {
        const Database = req('better-sqlite3')
        return this.sqliteDriver(Database)
      }
    } catch {
      return null
    }
    return null
  }

  private pgDriver(Client: any) {
    const client = new Client({ connectionString: this.endpoint, ...(this.authConfig ?? {}) })
    return {
      ping: async () => { await client.connect(); await client.query('SELECT 1'); await client.end() },
      query: async (sql: string, params: Record<string, any>) => {
        await client.connect()
        try {
          const { text, values } = bindNamedParams(sql, params)
          const res = await client.query(text, values)
          return res.rows
        } finally { await client.end() }
      },
    }
  }

  private mysqlDriver(mysql: any) {
    return {
      ping: async () => {
        const conn = await mysql.createConnection(this.endpoint)
        try { await conn.ping() } finally { await conn.end() }
      },
      query: async (sql: string, params: Record<string, any>) => {
        const conn = await mysql.createConnection(this.endpoint)
        try {
          const { text, values } = bindNamedParams(sql, params, '?')
          const [rows] = await conn.execute(text, values)
          return rows as any[]
        } finally { await conn.end() }
      },
    }
  }

  private sqliteDriver(Database: any) {
    // Endpoint is a file path for sqlite.
    const db = new Database(this.endpoint, { readonly: true })
    return {
      ping: async () => { db.prepare('SELECT 1').get() },
      query: async (sql: string, params: Record<string, any>) => db.prepare(sql).all(params),
    }
  }
}

function bindNamedParams(sql: string, params: Record<string, any>, placeholder: '?' | `$${number}` = '$0') {
  // Replace `:name` with `$1`, `$2`, ... (pg) or `?` (mysql). Returns ordered values.
  const values: any[] = []
  const names = Object.keys(params)
  const map = new Map<string, number>()
  const text = sql.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name) => {
    if (!(name in params)) return _m
    if (!map.has(name)) map.set(name, values.push(params[name]))
    const idx = map.get(name)!
    return placeholder === '?' ? '?' : `$${idx}`
  })
  // For '?' placeholder, order of values must match occurrences; recompute
  if (placeholder === '?') {
    const orderedValues: any[] = []
    sql.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name) => {
      if (name in params) orderedValues.push(params[name])
      return _m
    })
    return { text, values: orderedValues }
  }
  return { text, values }
}
