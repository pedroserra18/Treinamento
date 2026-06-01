// Read-heavy load test — simulates the most common production traffic
// pattern: users with a competition page open, occasionally polling /
// standings + /feed (Realtime takes the rest, but we still want the
// REST endpoints to be cheap because the cold-start fallback uses them).
//
// Usage:
//   $env:BASE_URL = "http://localhost:4000"   (or your prod URL)
//   $env:AUTH_TOKEN = "<JWT>"
//   $env:COMPETITION_ID = "<id of a real competition the user belongs to>"
//   k6 run --vus 100 --duration 30s read-heavy.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000'
const TOKEN = __ENV.AUTH_TOKEN || ''
const COMPETITION_ID = __ENV.COMPETITION_ID || ''

export const options = {
  thresholds: {
    // Hard SLO: 95% of requests under 500ms, error rate under 1%. If
    // either breaks, k6 exits with status 1 — useful for CI/CD gates.
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
  },
}

export default function () {
  if (!TOKEN || !COMPETITION_ID) {
    console.error('Set AUTH_TOKEN and COMPETITION_ID env vars before running')
    return
  }

  const params = {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  }

  // Three reads per iteration roughly matches a tab refresh:
  // standings (live ranking) + feed (last 30 proofs) + competition
  // detail (members, status).
  const standings = http.get(
    `${BASE_URL}/api/v1/competitions/${COMPETITION_ID}/standings`,
    params,
  )
  check(standings, { 'standings 200': (r) => r.status === 200 })
  errorRate.add(standings.status !== 200)

  const feed = http.get(`${BASE_URL}/api/v1/competitions/${COMPETITION_ID}/feed`, params)
  check(feed, { 'feed 200': (r) => r.status === 200 })
  errorRate.add(feed.status !== 200)

  const detail = http.get(`${BASE_URL}/api/v1/competitions/${COMPETITION_ID}`, params)
  check(detail, { 'detail 200': (r) => r.status === 200 })
  errorRate.add(detail.status !== 200)

  // 12s between iterations matches the original polling cadence. Under
  // Realtime this would be even slower in practice (page only polls on
  // WebSocket drop), so this is a pessimistic load profile.
  sleep(12)
}
