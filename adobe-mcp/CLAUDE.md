# Adobe Analytics MCP Server

## What this is

A local MCP (Model Context Protocol) server that lets an LLM client (opencode) query
Adobe Analytics using natural language — e.g. "how many sales did we have last week
on example.com" — by exposing report suite / metric / dimension lookup and report
execution as MCP tools.

The MCP client (opencode) talks to this server over **stdio** (local process, no
network). This server talks to Adobe **over the internet, through a corporate proxy**.
Those are two different transport concerns — never conflate them.

## Working style — read this before generating any code

This project is a **learning exercise**, not a delegate-and-done build. The goal is
for me to understand each piece as it's written, not to receive a finished MCP
server.

For every step, follow this structure:

1. **State the next step.** One concrete, small piece of work — e.g. "next: read
   and validate the proxy env vars in `config.js`" — not "next: build config.js."
2. **Explain why before how.** What problem this step solves, what breaks or stays
   fragile without it, and any trade-offs in the approach chosen. This is the part
   that actually teaches — don't skip or shorten it to get to the code faster.
3. **Walk through the code in small blocks, not full files.** Introduce one
   function, one config object, one piece of logic at a time, each with its own
   short explanation of what it does and why it's written that way. Never paste a
   complete file in one block — that collapses the whole learning step into a
   copy-paste.
4. **Stop and let me write/confirm each block** before moving to the next one
   within the same step, and stop at the end of the step before proposing the next
   one.

Additional rules:
- Don't scaffold the whole project or jump ahead to later files "for context"
  unless asked.
- If I ask a broad question ("build the MCP server"), treat that as a cue to
  propose the *first* step only, in the structure above — not to execute the whole
  plan.
- If I ask for something directly ("just give me the full file"), that overrides
  this section for that one request — but default back to step-by-step afterward.

## Tech stack

- **JavaScript (CommonJS), Node 18+ — no TypeScript, no build step.** Matches the
  company machine's constraints and the existing `lib/proxy.js` style, so
  everything in this project can be `require()`d and run directly with `node`,
  nothing to compile or transpile first.
- `@modelcontextprotocol/sdk` for the MCP server/tool layer
- `dotenv` to load `.env` into `process.env` (Node 18 has no built-in `.env`
  loading — that's a Node 20.6+ feature — so this is required, not optional).
  This project only needs it for `ADOBE_*` vars — see "PROXY_* lives in
  `lib/.env`, not here" below.
- `zod` for tool input schema validation — still useful in plain JS for runtime
  checks even without TypeScript's compile-time type inference; use it, but don't
  feel obligated to reach for it everywhere a simple `if` check would do
- **Not a dependency here:** `https-proxy-agent`. It's used by `lib/proxy.js`,
  but that module resolves it from `lib/node_modules` (its own, separate
  `package.json`), not from this project's `node_modules`. Don't add it to this
  project's `package.json` — it would be unused dead weight.
- No framework, no database — this is a thin translation layer over the Adobe
  Analytics Reporting API 2.0

## Architecture

```
opencode (MCP client)
   │ stdio — local only, never touches the proxy
   ▼
Local MCP server (this repo)
   ├── src/index.js        MCP tool registration + stdio transport (thin — no business logic)
   ├── src/adobeApi.js     listReportSuites / listMetrics / listDimensions / runReport / runBreakdownReport
   ├── src/adobeAuth.js    OAuth Server-to-Server token exchange + in-memory cache/refresh
   ├── src/proxyErrorHandling.js  callProxy() — normalizes lib/proxy.js's resolved-vs-rejected error shapes
   └── src/config.js       loads + validates all env vars once at startup, fails fast

   lib/proxy.js — EXISTING shared helper at d:/Development/tools/lib/proxy.js,
   lives OUTSIDE this repo, imported by relative path — see "Proxied HTTP
   helper" below
   │
   │ HTTPS via corporate proxy
   ▼
Adobe IMS (token exchange)  +  Adobe Analytics API 2.0 (analytics.adobe.io)
```

**Layering rule:** `adobeApi.js` and `adobeAuth.js` contain zero MCP-specific code —
they're plain, independently testable functions. `index.js` is the only file that
imports the MCP SDK; its job is translating MCP tool-call JSON into calls against
those plain functions and back. Don't let MCP concerns leak into the Adobe layer,
and don't let Adobe API details leak into `index.js`.

## Proxied HTTP helper — current state

`lib/proxy.js` (at `d:/Development/tools/lib/proxy.js`) is an **existing, shared**
CommonJS module maintained **outside this repo** — used by other, unrelated
scripts as well. Treat it as an external dependency, not something this project
owns — **do not rewrite, "improve", or copy it into `src/`**, even though better
versions have been explored and discarded (they broke compatibility with the
other scripts that depend on it).

It is imported by relative path from `src/`:

```javascript
const { GET, POST } = require("../../lib/proxy");
```

Both this project and `lib/proxy.js` are plain CommonJS, so `require(...)` works
the same way everywhere — no interop concerns to think about.

**`lib/proxy.js` is fully self-contained — and that has real implications:**
- It has its **own `package.json` and `node_modules`** inside `lib/` (with its own
  copies of `dotenv` and `https-proxy-agent`). Node resolves `require()` calls
  *inside* `proxy.js` starting from `proxy.js`'s own location and walking
  upward — **not** from this project's `node_modules` — so those two packages
  must never be removed from `lib/`'s own `package.json`, and don't need to be
  (re-)added to this project's `package.json`.
- It loads its **own `.env`** via `require('dotenv').config({ path:
  path.resolve(__dirname, '.env') })` — i.e. `lib/.env`, **not**
  `adobe-mcp/.env`. The `PROXY_*` credentials live there, not in this project's
  env vars. See "Environment variables" below.
- Both of the above mean `lib/proxy.js` works correctly regardless of what this
  project's `.env`/`package.json` contain — it doesn't depend on us for
  anything.

**What it does:**
- Exposes `GET(host, path, headers?)` and `POST(host, path, body, headers?)`.
- Routes every request through a corporate proxy via `HttpsProxyAgent`, using
  `PROXY_USER` / `PROXY_PASS` / `PROXY_DOMAIN` / `PROXY_PORT` (read from
  `lib/.env` / `process.env` at module load, once, and reused for every request).
- Supports an **optional** `PROXY_CERT` env var — a filesystem path to the
  corporate root CA / bundle. When set, it's read once at module load and attached
  to the proxy agent so TLS is properly validated against a TLS-inspecting proxy.
  When unset, normal public CA validation applies. TLS verification is never
  disabled outright — this was a deliberate fix, don't reintroduce
  `NODE_TLS_REJECT_UNAUTHORIZED = "0"`.

**What it does NOT do — important for how `adobeApi.js` and `adobeAuth.js` must
be written:**
- **Always *resolves* on HTTP status, but *rejects* on network-level errors.**
  A 401/403/429/500 from Adobe comes back as a *resolved* `{ data }` — the code
  never inspects `res.statusCode` at all — so every call site in `adobeApi.js` /
  `adobeAuth.js` must check the parsed response body itself for Adobe's error
  shape; `try/catch`/`.catch()` will NOT catch a bad HTTP status. Separately, a
  connection-level failure (DNS failure, proxy unreachable, TLS handshake
  failure) *does* reject the promise — but with a plain `{ error: message }`
  object, not an `Error` instance, via the request's own `"error"` event. So
  callers need to handle three distinct outcomes: resolved-with-good-data,
  resolved-with-Adobe's-error-shape, and rejected-with-`{ error }`.
- **Does not parse the response body.** `data` is always the raw response string.
  Every caller must `JSON.parse(data)` itself when expecting JSON, and handle the
  case where parsing fails (e.g. an HTML error page from the proxy instead of the
  expected API response).
- **Defaults `Content-Type` to `application/json` on every request**, including the
  IMS token exchange, which needs `application/x-www-form-urlencoded` instead —
  remember to override this header explicitly for that one call.
- **No request timeout.** A hung connection (dead proxy, stalled TLS handshake)
  will wait indefinitely. Consider wrapping calls in `Promise.race` with a timeout
  in `adobeApi.js` if this becomes a problem in practice.
- **No `PUT`/`DELETE`**, only `GET`/`POST` — not needed for the Analytics Reporting
  API 2.0 endpoints this project uses, but don't assume they exist if the scope
  ever expands.

## Non-negotiables

1. **All outbound HTTP goes through the shared `lib/proxy.js` import.** No raw
   `fetch()` or `https.request()` anywhere else in the codebase. This is what makes
   the proxy config a one-place change instead of a hunt-and-fix later.
2. **Never disable TLS verification** (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`). The
   proxy's root CA is trusted specifically via `PROXY_CERT` (see below), not
   blanket verification-off. This is a hard rule, not a style preference.
3. **Check the parsed response body for Adobe's error shape in every call site.**
   Since `lib/proxy.js` resolves regardless of HTTP status (see above), 401s
   (expired token), 403s (missing permission), and 429s (rate limited) will NOT
   throw — `adobeApi.js` / `adobeAuth.js` must inspect the parsed JSON themselves
   and turn errors into rejected promises or MCP tool-error responses explicitly.
4. **Token caching lives only in `adobeAuth.js`.** One in-memory cache, refreshed
   proactively ~60s before expiry. Nothing else should know how Adobe auth works.
5. **Let the LLM do date/metric resolution, not this server.** Don't hardcode "sales
   = metric X" or parse "last week" server-side. Expose `listMetrics` /
   `listDimensions` / `listReportSuites` so the LLM can resolve ambiguous terms
   against the actual report suite, and pass today's date into context so it can
   compute ISO date ranges itself. Keep the server dumb and deterministic.

## Environment variables

This project's own `.env` (gitignored, at `adobe-mcp/.env`) holds only the Adobe
credentials:

```
ADOBE_CLIENT_ID=
ADOBE_CLIENT_SECRET=
ADOBE_ORG_ID=
ADOBE_TECHNICAL_ACCOUNT_ID=
ADOBE_SCOPES=               # comma-separated, exact value from the OAuth Server-to-Server
                             # credential page in Adobe Developer Console — varies per project,
                             # do not guess/hardcode this
ADOBE_GLOBAL_COMPANY_ID=    # required in the URL path of every Analytics Reporting API 2.0
                             # call (/api/{globalCompanyId}/...) — looked up manually rather
                             # than discovered at runtime, see "Adobe API specifics" below
```

`config.js` reads and validates these at process start and throws with a clear
message naming the missing variable — fail at boot, not three tool calls deep.

**`PROXY_*` vars are NOT part of this project's `.env`.** They live in
`d:/Development/tools/lib/.env`, read directly by `lib/proxy.js` itself (see
"Proxied HTTP helper" above):

```
PROXY_USER=
PROXY_PASS=
PROXY_DOMAIN=
PROXY_PORT=
PROXY_CERT=                # optional — path to corporate root CA/bundle, only needed if the proxy does TLS inspection
```

`config.js` in this project has no reason to read or validate `PROXY_*` — it
isn't this project's responsibility, and `lib/proxy.js` already fails on its own
(e.g. `PROXY_CERT` set but unreadable throws at `require()` time) if its own env
is misconfigured.

## MCP tools to implement

| Tool | Purpose |
|---|---|
| `listReportSuites` | Resolve a domain/site name to an Adobe report suite ID |
| `listMetrics(reportSuiteId)` | Resolve terms like "sales" to actual metric IDs for that suite |
| `listDimensions(reportSuiteId)` | Same, for dimensions |
| `runReport(reportSuiteId, metrics[], dimension?, startDate, endDate, segments?)` | Executes the actual report via `POST /reports` |
| `runBreakdownReport(reportSuiteId, metrics[], dimension, breakdownDimension, breakdownItemId, startDate, endDate, segments?)` | Second step of a drill-down: breaks down by `dimension`, restricted to rows where `breakdownDimension` equals `breakdownItemId` |

Keep tools few and flexible rather than many and narrow — let the LLM compose them
rather than trying to anticipate every phrasing of a question server-side.

**`dimension` is singular, not an array.** Adobe's `POST /reports` endpoint only
supports one breakdown dimension per call — real multi-dimension breakdown
requires sequential drill-down calls (filter by `itemId` per value of the first
dimension). `runBreakdownReport` is that second call: resolve an item ID for the
first dimension (via `runReport` or `listDimensions`), then call
`runBreakdownReport` to break down a second dimension within just that item.
For breakdowns beyond two dimensions, the LLM should chain more calls rather
than expecting this server to do the drill-down itself.

## Adobe API specifics to remember

- Auth is **OAuth Server-to-Server**, not JWT (deprecated) and not user OAuth.
- The token request's `scope` param is **not a fixed value** — it's whatever
  string Adobe Developer Console shows on the OAuth Server-to-Server credential
  page for this specific project, stored in `ADOBE_SCOPES`. Never hardcode a
  guessed scope string — a wrong-but-plausible-looking one produces a token that
  exchanges successfully but then fails on every real Analytics call with a
  permissions error that looks unrelated to auth.
- Token endpoint (`ims-na1.adobelogin.com`) expects
  `application/x-www-form-urlencoded`, NOT JSON — `lib/proxy.js` defaults to
  `application/json`, so this call must explicitly override the `Content-Type`
  header and build the body as a query string, not `JSON.stringify(...)`.
- Reporting calls (`analytics.adobe.io`) are JSON — but remember `lib/proxy.js`
  hands back a raw string either way, so both the token exchange response and every
  reporting response need an explicit `JSON.parse()` in `adobeAuth.js` /
  `adobeApi.js`. Wrap each in try/catch in case the proxy itself returns something
  non-JSON (e.g. an HTML auth-challenge page) — that failure looks identical to a
  normal resolved response and won't throw on its own.
- Required headers on reporting calls: `Authorization: Bearer <token>`,
  `x-api-key: <client_id>`, `x-gw-ims-org-id: <org_id>`.
- Every Analytics Reporting API 2.0 endpoint requires a **global company ID** in
  the URL path itself: `analytics.adobe.io/api/{globalCompanyId}/collections/suites`,
  `/metrics`, `/dimensions`, `/reports`. This is looked up once manually (e.g. via
  `analytics.adobe.io/discovery/me`, or the Adobe Analytics UI) and stored as
  `ADOBE_GLOBAL_COMPANY_ID` — deliberately not fetched dynamically at runtime, to
  avoid an extra network round-trip and caching layer for a value that basically
  never changes.
- The token response's `expires_in` is in **seconds**, not milliseconds —
  verified against a real response (came back as `86399`, i.e. Adobe's
  standard 24h access token lifetime). `adobeAuth.js` multiplies by 1000
  before computing the cache expiry.
- `POST /reports` request body: `dateRange` is built as
  `${startDate}T00:00:00.000/${endDate}T00:00:00.000` (no timezone suffix,
  assumed exclusive end boundary). A real 7-day test range returned exactly 7
  daily rows, consistent with an exclusive end — decent evidence, not a full
  confirmation (per-day values weren't checked). Re-verify if numbers look
  off by one day near a range edge.
- The Adobe account/technical account used for the S2S credential must belong to a
  product profile with the relevant report suite + metrics/dimensions access.
- **`globalFilters` segment entries accept an inline definition, not just a saved
  `segmentId`.** Confirmed against a live `/reports` call (2026-08-09):
  `{ type: "segment", segmentDefinition: {...} }`
  works, where `segmentDefinition` is Adobe's own segment JSON (`func: "segment"`,
  `version: [1,0,0]`, `container: { func: "container", context, pred: { func,
  val: { func: "attr", name }, str?, description? } }`). This is *not* documented
  in Adobe's own Reports API guide (only `segmentId` is shown there) — the shape
  was captured live from Analysis Workspace's segment-editor preview traffic, and
  matches the (separately documented) Segments API's definition format. Analysis
  Workspace itself never sends this inline — it always persists ad hoc segments to
  the Segment service first and references them by ID, so this behavior had to be
  discovered by testing directly against `/reports`, not by observing Workspace.
  `runReport`/`runBreakdownReport`'s `segments` param accepts either shape per
  entry (string → `segmentId`, object → `segmentDefinition`).

## opencode integration

This server runs as a local stdio process, configured in `opencode.json`:

```json
{
  "mcp": {
    "adobe-analytics": {
      "type": "local",
      "command": ["node", "/absolute/path/to/adobe-analytics-mcp/src/index.js"]
    }
  }
}
```

No build/compile step needed — the command points straight at the source file
since this is plain JavaScript.

Secrets (proxy creds, Adobe client secret) live in this repo's `.env`, loaded by
`config.js` — do not duplicate them into `opencode.json`.

## Coding conventions

- Plain JavaScript, CommonJS (`require`/`module.exports`), Node 18+ — matches
  `lib/proxy.js` and the company machine's lack of TypeScript tooling. No
  build step, run files directly with `node`.
- Use `"use strict";` at the top of each file (or rely on it implicitly if the
  project ends up using ES modules later) to catch accidental globals and other
  common JS footguns that TypeScript would otherwise catch at compile time.
- One responsibility per file per the layering above — resist adding "just one more
  thing" to `index.js`.
- Every exported function that makes an Adobe call should be independently callable
  and testable without an MCP client attached (i.e. you can `node -e` call
  `adobeApi.runReport(...)` directly while debugging).
- Prefer explicit error objects (`{ error, status }`) over throwing raw strings, so
  MCP tool handlers can turn them into meaningful tool-error responses instead of
  crashing the process.
- Use JSDoc comments (`/** @param {string} reportSuiteId */`) on exported functions
  — cheap, editor-friendly type hints without needing TypeScript itself.