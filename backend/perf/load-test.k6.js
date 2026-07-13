// Performance baseline load test (k6).
// Usage: `k6 run backend/perf/load-test.k6.js --env BASE_URL=http://localhost:3000`.
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m',  target: 50 },
    { duration: '30s', target: 0  },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

const BASE = __ENV.BASE_URL || 'http://localhost:3000'

export function setup() {
  const res = http.post(`${BASE}/api/v1/auth/login`,
    JSON.stringify({ email: 'admin@compstlar.eu', password: 'admin123' }),
    { headers: { 'Content-Type': 'application/json' } })
  check(res, { 'login ok': (r) => r.status === 200 })
  return { token: res.json('access_token') }
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' }
  const endpoints = ['/api/v1/iterations', '/api/v1/machines', '/api/v1/dashboards/kpis', '/api/v1/files']
  for (const ep of endpoints) {
    const r = http.get(`${BASE}${ep}`, { headers })
    check(r, { [`${ep} 200`]: (x) => x.status === 200 })
  }
  sleep(1)
}
