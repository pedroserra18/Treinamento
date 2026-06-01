// Auth + write flow load test — exercises the heavy paths:
// login → create competition → leave (which cancels). This is the
// "registration + onboarding cohort" pattern (lots of new users
// trying things out at once).
//
// The createCompetition path runs the Serializable transaction that
// enforces "one active per user". This load test catches any
// serialization-failure leaks that would surface as 500s in production.
//
// Usage:
//   $env:BASE_URL = "http://localhost:4000"
//   k6 run --vus 30 --duration 30s auth-flow.js
//
// Tip: 30 VUs hammering register+login is conservative. Push higher
// only when you have a paid DB tier — Supabase free pgbouncer has a
// connection cap that registration bursts can hit.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000'

export const options = {
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    errors: ['rate<0.02'],
  },
}

function uniqueEmail() {
  return `k6-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@loadtest.local`
}

export default function () {
  const email = uniqueEmail()
  const password = 'Password123!'

  // Register
  const register = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({ name: 'k6 loadtest', email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  // Register can 200 or 409 (already exists) — both fine, login is the
  // real check below.
  errorRate.add(register.status >= 500)

  // Login
  const login = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  check(login, { 'login 200': (r) => r.status === 200 })
  errorRate.add(login.status !== 200)
  if (login.status !== 200) return

  const token = login.json('data.accessToken')

  // Onboarding (zero-config so this is fast)
  const onboard = http.post(
    `${BASE_URL}/api/v1/auth/onboarding/complete`,
    JSON.stringify({ sex: 'MALE', availableDaysPerWeek: 4 }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  )
  errorRate.add(onboard.status !== 200)

  // Create competition — exercises the Serializable transaction
  const create = http.post(
    `${BASE_URL}/api/v1/competitions`,
    JSON.stringify({ name: `k6 ${Date.now()}`, type: 'BOTH', durationDays: 30 }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  )
  check(create, { 'create 201': (r) => r.status === 201 })
  errorRate.add(create.status !== 201)
  if (create.status !== 201) return

  const compId = create.json('data.id')

  // Leave so the next iteration of the same VU can create again
  // (test runs in a loop per VU). Otherwise the second iteration would
  // 409 with COMPETITION_ALREADY_IN_ANOTHER and skew error rate.
  const leave = http.post(
    `${BASE_URL}/api/v1/competitions/${compId}/leave`,
    null,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  errorRate.add(leave.status !== 200)

  sleep(1)
}
