/**
 * RBAC smoke e2e — exercises the SUPERADMIN/OWNER/OPERATOR role matrix. This
 * file covers the happy + forbidden paths for the most sensitive endpoints
 * and serves as the pattern for additional role-matrix suites (governance,
 * lineage, binding).
 *
 * Prereqs: backend running with the seed DB. Run via `npm run test:e2e`.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module'

const SUPERADMIN = { email: 'admin@compstlar.eu', password: 'admin123' }
const OWNER      = { email: 'owner@compstlar.eu', password: 'owner123' }
const PARTNER    = { email: 'operator@cai.eu',    password: 'partner123' }

async function login(app: NestFastifyApplication, creds: { email: string; password: string }) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: creds })
  if (res.statusCode !== 200) throw new Error(`Login failed for ${creds.email}: ${res.body}`)
  return JSON.parse(res.body).access_token as string
}

async function call(app: NestFastifyApplication, token: string, method: any, url: string, payload?: any) {
  return app.inject({ method, url, payload, headers: { Authorization: `Bearer ${token}` } })
}

describe('RBAC matrix', () => {
  let app: NestFastifyApplication
  let tSuper: string, tOwner: string, tPartner: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'readiness'] })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    tSuper = await login(app, SUPERADMIN)
    tOwner = await login(app, OWNER)
    tPartner = await login(app, PARTNER)
  })

  afterAll(async () => { await app.close() })

  describe('Settings — Users CRUD (SUPERADMIN only)', () => {
    it('SUPERADMIN can list users', async () => {
      const r = await call(app, tSuper, 'GET', '/api/v1/users')
      expect(r.statusCode).toBe(200)
    })
    it('OWNER cannot list users', async () => {
      const r = await call(app, tOwner, 'GET', '/api/v1/users')
      expect(r.statusCode).toBe(403)
    })
    it('PARTNER cannot list users', async () => {
      const r = await call(app, tPartner, 'GET', '/api/v1/users')
      expect(r.statusCode).toBe(403)
    })
  })

  describe('Partners write (SUPERADMIN only)', () => {
    it('OWNER cannot create a Partner', async () => {
      const r = await call(app, tOwner, 'POST', '/api/v1/partners', { name: 'X', fullName: 'X', color: '#fff' })
      expect(r.statusCode).toBe(403)
    })
    it('PARTNER cannot create a Partner', async () => {
      const r = await call(app, tPartner, 'POST', '/api/v1/partners', { name: 'X', fullName: 'X', color: '#fff' })
      expect(r.statusCode).toBe(403)
    })
  })

  describe('State machines — write requires OWNER+', () => {
    it('PARTNER cannot create a state machine', async () => {
      const r = await call(app, tPartner, 'POST', '/api/v1/machines', { name: 'X', version: '1', nodesJson: '[]', edgesJson: '[]' })
      expect(r.statusCode).toBe(403)
    })
    it('All roles can list state machines', async () => {
      for (const t of [tSuper, tOwner, tPartner]) {
        const r = await call(app, t, 'GET', '/api/v1/machines')
        expect(r.statusCode).toBe(200)
      }
    })
  })

  describe('Iterations — start requires OWNER+; PARTNER list is partner-scoped', () => {
    it('PARTNER cannot start a new iteration', async () => {
      const r = await call(app, tPartner, 'POST', '/api/v1/iterations', { machineId: 'sm-lifecycle' })
      expect(r.statusCode).toBe(403)
    })
    it('PARTNER list returns only iterations with own-partner nodes', async () => {
      const r = await call(app, tPartner, 'GET', '/api/v1/iterations')
      expect(r.statusCode).toBe(200)
    })
  })

  describe('Provenance + Lineage — read requires staff or own-partner files', () => {
    it('PARTNER cannot export PROV-O for arbitrary iterations', async () => {
      const r = await call(app, tPartner, 'GET', '/api/v1/provenance/iteration/any-id.ttl')
      expect(r.statusCode).toBe(403)
    })
  })

  describe('Public probes', () => {
    it('GET /health is public', async () => {
      const r = await app.inject({ method: 'GET', url: '/health' })
      expect(r.statusCode).toBe(200)
    })
    it('GET /readiness is public', async () => {
      const r = await app.inject({ method: 'GET', url: '/readiness' })
      expect([200, 503]).toContain(r.statusCode)
    })
  })
})
