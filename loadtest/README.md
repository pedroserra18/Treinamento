# Load testing with k6

## Why

The Phase 2 optimizations (pre-aggregated standings, cursor pagination,
Realtime instead of polling) were designed for thousands of concurrent
users. This directory proves the work actually pays off, by simulating
real load against the API and measuring p95 latency under stress.

## Install k6 (one-time)

**Windows**:

```powershell
winget install k6
# or via Chocolatey:
choco install k6
```

**Mac**:

```bash
brew install k6
```

Confirm with `k6 version`.

## What's here

| File | Purpose |
|---|---|
| `read-heavy.js` | 100 concurrent users hitting /standings + /feed for 30s. The most common production load pattern — page open + Realtime + occasional polling. |
| `auth-flow.js` | Login → create competition → leave loop. Measures the full transactional path including the Serializable transaction in createCompetition. |
| `rate-limit.js` | Verifies the per-user limiter actually kicks in around 120 rpm on /standings. |

## How to run

### Against localhost (dev sanity check)

```powershell
# In one terminal — make sure the API is running
cd api && npm run dev

# In another terminal — pick a script:
cd loadtest
k6 run --vus 50 --duration 30s read-heavy.js
```

### Against the deployed Render URL

```powershell
# Set the base URL via env var (the scripts read BASE_URL)
$env:BASE_URL = "https://acad-api.onrender.com"
$env:AUTH_TOKEN = "<paste a valid JWT from your browser localStorage>"
k6 run --vus 100 --duration 60s read-heavy.js
```

Render free tier has a cold start of ~30s. Run a warmup call before
the load test or the first burst will measure cold-start latency
instead of steady-state.

## What to watch in the output

k6 prints a summary at the end. The numbers that matter for "ready to
ship":

| Metric | Healthy | Investigate if |
|---|---|---|
| `http_req_duration{...}` p95 | < 300ms | > 1s |
| `http_req_failed` rate | < 0.5% | > 2% |
| `iteration_duration` p95 | matches the script's sleep + req | spikes way above |
| `vus` peaks | matches `--vus` | drops mid-run (server choking) |

The most useful number is **p95 of `http_req_duration`**. If it's under
300ms at 100 vus on /standings, the materialised stats table is doing
its job. If p95 spikes above 1s, the bottleneck is likely:

- Cold start (run a warmup curl first)
- DB pool exhaustion (Supabase free has ~200 conn — pgbouncer should
  multiplex, but check `REDIS_URL` is set for rate limiter so it
  doesn't fall back to in-memory)
- Sentry beforeSend serialization (rare, look in logs)

## Tuning the load

The defaults (50–100 vus, 30s–60s) are sane for a free-tier deploy.
For a paid deploy, push higher to find the breaking point:

```powershell
k6 run --vus 500 --duration 2m --stage 30s:0,1m:500,30s:0 read-heavy.js
```

That ramps from 0 to 500 vus over 30s, holds for 1min, then ramps
down. The output shows latency degradation as load increases — exactly
the data you need to size the API instance.

## Got an account-bound token?

The /standings endpoint requires auth. The simplest way to feed a real
JWT is:

1. Open the app in your browser
2. DevTools → Application → Local Storage → copy the value of `acad:auth-token` (or whatever key the app uses)
3. Export it: `$env:AUTH_TOKEN = "<paste>"`
4. Run k6 — the script reads `__ENV.AUTH_TOKEN` and adds the Bearer header

This is fine for ad-hoc testing. For CI/automated load tests, mint a
service token via the test user fixture in tests/jest/.
