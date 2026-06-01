// Rate-limit smoke test — a single user hammers /standings to verify
// the per-user limiter kicks in around 120 rpm and returns 429 instead
// of overwhelming the DB. Sanity check: that limiter exists for a
// reason, and silent regressions to its config (max=120, window=60s)
// would let one bot drown the API.
//
// Usage:
//   $env:BASE_URL = "http://localhost:4000"
//   $env:AUTH_TOKEN = "<JWT>"
//   $env:COMPETITION_ID = "<id>"
//   k6 run --vus 1 --iterations 200 rate-limit.js

import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000'
const TOKEN = __ENV.AUTH_TOKEN || ''
const COMPETITION_ID = __ENV.COMPETITION_ID || ''

export const options = {
  // Single VU = single user. 200 iterations with no sleep = fires as
  // fast as the network allows. Expectation: first ~120 succeed, the
  // rest get 429.
  thresholds: {
    'http_req_failed{status:429}': ['rate>0.3'],
  },
}

let okCount = 0
let limitedCount = 0

export default function () {
  if (!TOKEN || !COMPETITION_ID) {
    console.error('Set AUTH_TOKEN and COMPETITION_ID before running')
    return
  }

  const res = http.get(
    `${BASE_URL}/api/v1/competitions/${COMPETITION_ID}/standings`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  )

  if (res.status === 200) okCount++
  if (res.status === 429) limitedCount++

  check(res, { 'returns 200 or 429': (r) => r.status === 200 || r.status === 429 })
}

export function teardown() {
  console.log(`OK: ${okCount}, RATE LIMITED: ${limitedCount}`)
  if (limitedCount === 0) {
    console.error('Limiter never fired — check competitionReadLimiter config')
  }
}
