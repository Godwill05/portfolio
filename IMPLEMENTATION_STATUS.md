# FolioForge — Implementation Status

> Living document. Last updated: **2026-11-22**.
> Everything marked ✅ below was **executed and observed**, not merely written.
> Anything not verified is marked 🟡 (code exists, unverified) or ❌ (not built).

---

## 1. Snapshot

| Layer | State |
| --- | --- |
| Backend (NestJS 11 + TypeORM 1.1 + MySQL 5.7) | **Substantially complete** — 76 source files, 32 tables |
| AI module | **Complete and exercised end-to-end** against a mock OpenAI-compatible provider |
| CV generator (12 templates + PDF) | **Complete, 12 PDFs visually verified** |
| Frontend (Angular 20) | ❌ **Essentially not started** — only the default CLI shell exists |
| Payments / Billing | ❌ Not implemented (schema + settings keys only) |
| File uploads | ❌ Not implemented (entity only) |
| Install docs | ❌ `README.md` is still a 1-line placeholder |

**The single largest remaining gap is the Angular frontend.** Almost every backend
capability below is reachable by HTTP but has no UI.

---

## 2. Verified environment

| Item | Value |
| --- | --- |
| MySQL | `127.0.0.1:3306`, database `portfolio`, user/password `portfolio`/`portfolio`, 5.7.29 |
| API | `http://localhost:4000`, global prefix `/api`, Swagger at `/api/docs` |
| Super admin | `admin@folioforge.local` / from `ADMIN_PASSWORD` (**`ChangeMe!2026` in `.env` — must change**) |
| Demo user | `demo@folioforge.local` / `DemoFolio2026`, portfolio slug `awa-dossou` |
| AI (test only) | mock provider at `127.0.0.1:4123` registered as `openai_compatible`, models `mock-fast` / `mock-smart` |

---

## 3. Backend — done and verified

### 3.1 Database
- ✅ Single versioned migration `1795340866317-InitialSchema.ts`; migrations only, no `synchronize`.
- ✅ 27 tables: users, user_sessions, email_tokens, notifications, professional_profiles,
  skills, projects, project_skills, experiences, experience_skills, educations,
  profile_languages, portfolio_daily_views, portfolio_templates, cv_templates, cvs,
  file_assets, settings, ai_providers, ai_models, ai_task_routes, ai_conversations,
  ai_messages, ai_usage_logs, quota_policies, quota_ledger, contact_messages,
  job_opportunities, transactions, processed_webhooks, audit_logs, rewarded_ad_claims.
- ✅ Indexes on hot paths (profile+created, slug, session, ledger day/feature, etc.).
- ✅ Soft delete via `deletedAt` on user-owned content; restore endpoint for CVs.
- ✅ Seeds: default settings, CV templates, roles/permissions, admin from env, optional demo.

### 3.2 Auth & security
- ✅ register / login / logout / logout-all, session list + revoke, refresh rotation with
  replay-family revocation, email verification, forgot/reset password, change password,
  account deletion.
- ✅ argon2id (19456 KiB / 2 iterations / 1 lane).
- ✅ Roles: super admin / admin / user, permission map in `common/constants/domain.ts`.
- ✅ Brute-force lockout on repeated failures, `@nestjs/throttler` rate limiting,
  `class-validator` DTO validation with whitelist, Helmet security headers, CORS config,
  HttpOnly cookies.
- ✅ Secrets at rest: `SecretCipher` (AES-256-GCM) for AI keys and payment keys; only a
  key hint / `configured` boolean ever leaves the server.
- ✅ Uniform error envelope `{statusCode, code, message, details?, path, timestamp, requestId?}`
  and `{data}` success wrapper.

### 3.3 Portfolio & profile (scope items A–D)
- ✅ Professional profile, skills (with level/category/reorder), projects (+ `project_skills`
  join), experiences (+ `experience_skills`), educations, languages.
- ✅ Public portfolio by slug with visibility, SEO/meta payload, daily view tracking,
  indexability flag, profile completeness score.
- ✅ 22 REST operations on `/api/me/profile/*`, plus public `/api/portfolio/:slug`.

### 3.4 CV generator
- ✅ `GET /api/cvs/templates` → 12 templates.
- ✅ Library: list/stats/create/get/patch/duplicate/refresh/restore/delete, `{items, meta}` pagination.
- ✅ Editor payload supports section ordering, per-template config, accent colours.
- ✅ Real PDF export (`GET /api/cvs/:id/pdf`, `preview.pdf`) — A4, selectable text.
- ✅ **All 12 PDFs rendered and visually inspected**; layouts genuinely differ
  (atlas banded header, meridian classic prose, vector tech sidebar, palette creative band,
  sorbonne serif academic, plus carthage, colbert, narrative, matrix, sprout, summit, orient).

PDF engine notes (important — bugs already fixed, do not regress):
- Body copy **must** go through `TextEngine` (`lineBreak:false`, explicit x/y). Plain
  `doc.text()` triggers PDFKit auto-pagination and produced overlapping text.
- Colours **must** be hex strings via `css()` from `pdf/text-engine.ts`. PDFKit divides
  numeric *arrays* by 255, so 0–1 float tuples painted near-black.
- Without `charSpace()` on `PDFDocument`, use `{ characterSpacing }` in text options.

### 3.5 AI assistant
- ✅ Adapters: `openai_compatible` (also covers OpenRouter and self-hosted OSS),
  `anthropic`, `gemini`; factory + shared `base.provider.ts` with retry/timeout.
- ✅ Admin CRUD: providers, models (discovery + import + manual), per-task routes
  (`chat`, `cv`, `job_analysis`, `complex`) with primary/fallback, temperature, max tokens,
  connection test, `ready` probe.
- ✅ Gateway: failover across targets, per-target usage logging, cost/token accounting,
  input-size ceiling, provider error classification, refund on failure.
- ✅ Chat: persistent conversations, rename, pin, delete, history, non-streaming and
  **SSE streaming verified** (`meta` → `delta`×N → `done`).
- ✅ Features: `cv/optimize`, `cv/generate`, `jobs/analyze`, `cover-letter`, `career/plan`.
- ✅ Opportunities CRUD with analysis persistence and match score.
- ✅ Quotas: `quota_policies` (user/role/global precedence) + `quota_ledger`, per-feature
  limits, admin unlimited, **429 path verified**, refund on provider failure.
- ✅ Rewarded ads: signed server-side postback, idempotent, daily cap, **cleanly disabled**
  when `REWARDED_AD_PROVIDER`/`REWARDED_AD_SECRET` are unset (verified: HTTP 403).
- ✅ Non-fabrication rule injected into every CV-facing system prompt, with a
  user-facing "verify before use" disclaimer on each response.

### 3.6 SSRF-protected job-offer fetching (added this session)
`src/common/utils/url-fetcher.ts` — new, no dependency added.
- ✅ Only `http`/`https`, no embedded credentials, no non-standard ports.
- ✅ Blocks loopback, RFC1918, link-local (incl. `169.254.169.254`), CGNAT, TEST-NET,
  multicast, reserved; blocks IPv6 loopback/ULA/link-local/multicast and IPv4-mapped forms.
- ✅ **Resolves DNS itself and pins the socket to the validated IP**, closing the
  DNS-rebinding window (verified with `127.0.0.1.nip.io`).
- ✅ Every redirect hop is revalidated; hop count, wall-clock timeout, and streamed byte
  ceiling enforced; only `text/html`, `text/plain`, `application/xhtml+xml` accepted.
- ✅ HTML→text extraction strips script/style/svg/iframe, decodes entities safely.
- ✅ Fetched text is neutralised (delimiter collapse, chat-token stripping, role-marker
  defanging) before embedding, and labelled as untrusted data in the prompt.

### 3.7 Admin console backend (added this session)
`src/modules/admin/` — new module, 9 endpoints, all exercised against live data.
- ✅ `GET /api/admin/analytics/overview?days=` — users (total/active/verified/suspended/
  new/byRole), content counts, contacts, AI (requests, tokens, estimated cost, success rate,
  by feature, by day), billing (paid total, by status, ad claims), quota consumed by feature.
  **All values computed from real rows** — verified: 2 users, 42 CVs, 8 AI requests, 87.5% success.
- ✅ `GET /api/admin/analytics/timeseries?days=` — daily signups + AI requests for charts.
- ✅ `GET /api/admin/users` — paginated, searchable, filterable by role/status; never returns
  `passwordHash`; includes the role's permission list.
- ✅ `GET /api/admin/users/:id` — profile, session count, AI request count, last 10 AI calls
  (feature/model/tokens/latency), full quota summary.
- ✅ `PATCH /api/admin/users/:id` — role/status/name; revokes sessions on role change or
  suspension; writes an audit entry.
- ✅ `POST /api/admin/users/:id/quota` — admin credit adjustment (bounded ±500), audited.
- ✅ `GET /api/admin/users/:id/sessions`, `POST .../sessions/revoke`.
- ✅ `DELETE /api/admin/users/:id` — soft delete with audit.
- ✅ `GET /api/admin/audit` — paginated audit log with action filter and search.

**Safety guards, all verified:**
| Guard | Result |
| --- | --- |
| Non-admin calls analytics | `403 Forbidden` |
| Admin demotes self | `422` "Vous ne pouvez pas modifier votre propre rôle." |
| Admin suspends self | `422` "Vous ne pouvez pas désactiver votre propre compte." |
| Last super admin demoted/deleted | `422` refused |
| Credit grant applied | `cv.optimize` 0 → 3 remaining, `bonusCredits: 3` |
| Audit trail | `user.quota.adjust` recorded with actor, entity, changes |

### 3.8 Notifications & settings
- ✅ Notification service + controller (list, unread count, mark read, mark all, delete),
  wired into AI/quota events.
- ✅ Settings persisted in MySQL, cached in memory, cache invalidated on write; public
  bootstrap subset for the pre-login shell; secret sub-paths never serialised.

---

## 4. Bugs found and fixed this session

| # | Bug | Impact | Fix |
| --- | --- | --- | --- |
| 1 | **Refunds were counted as bonus credits** | Every failed AI call *granted* a free credit. Observed: 5 failures turned a 3/day limit into 8 remaining. Silent quota bypass. | Ledger now splits by `reason`: usage = `consume`+`refund`, bonus = `grant`/`bonus_ad`/`bonus_donation`. `grantBonus` rejects non-grant reasons. Regression tests added. |
| 2 | Model-import DTO validated against `Object` | Whitelist stripped every field → import always failed with 422. | Replaced with a concrete `ImportedModelDto` + `@Type`. |
| 3 | Route update returned raw FK error 409 | Bad model id produced an opaque `RELATION_CONFLICT`. | Validates referenced models first, returns clear 422. |
| 4 | No URL fetching existed for job analysis | `sourceUrl` was stored but never read — required SSRF feature was absent. | Implemented §3.6. |
| 5 | Fetched content could break the prompt delimiter | Prompt-injection surface. | `neutralizeUntrusted` + explicit prompt wording + tests. |
| 6 | JSON-mode drift returned `201` with `analysis: null` | UI would render an empty panel while the quota unit was spent. | `requireStructured()` throws → quota refunded → actionable error. |
| 7 | Adding `test/**` to the build widened `rootDir` | `dist/main.js` moved to `dist/src/main.js`, breaking `npm start`. | Added `tsconfig.build.json`, pointed `nest-cli.json` at it. |
| 8 | Failed stream left a stale `messageCount` | Conversation list showed phantom messages. | Counter now reflects what is actually persisted. |
| 9 | Port guard fired before host guard | `http://127.0.0.1:4000` reported "non-standard port" instead of "internal address". | Host checks run first. |
| 10 | `coverLetterMessages` crashed on missing `jobText` | 500 instead of a validation error. | `neutralizeUntrusted` tolerates nullish input. |
| 11 | `auditLog()` nested its result in `{data:{items,meta}}` | Inconsistent with every other paginated list; a client reading `.items` would fail. | Returns the flat `{items, meta}` shape the interceptor expects; `meta` now also carries `totalPages`/`hasNext`/`hasPrev`. |
| 12 | Double quote escaping produced a literal `\u201D` | Delimiter neutralisation emitted backslash text instead of the intended character. Caught by a temporary assertion test, then fixed. | Real `\u201D` character; verified. |

---

## 5. Tests — executed

```
apps/api  npx vitest run    →  3 files, 70 tests, all passing
apps/api  npx tsc --noEmit  →  clean
apps/api  npx nest build    →  dist/main.js emitted
```

| File | Tests | Covers |
| --- | --- | --- |
| `test/url-fetcher.spec.ts` | 50 | IP classification (v4/v6), URL validation, scheme/credential/port rules, HTML extraction, entity-decoding attacks, live loopback refusal, DNS-rebinding hostname, redirect revalidation |
| `test/quota.service.spec.ts` | 9 | consume/refund/grant accounting, the refund-as-bonus regression, 429 path, admin bypass, ledger row integrity |
| `test/prompt-injection.spec.ts` | 11 | delimiter breakout, chat-token stripping, untrusted-data labelling, non-fabrication presence, JSON parsing edge cases |

`test/setup.ts` publishes deterministic test env and **refuses to run against a database
whose name does not end in `_test`**.

### Also verified manually against the running API
- Provider create → connection test (latency + discovered models + prices) → model import (2) → default model → per-task routes → `ready: true`.
- `chat` (non-stream), `chat/stream` (7 deltas + done + token usage), `cv/generate` (JSON parsed), `jobs/analyze` (match score 78, opportunity persisted), `cover-letter`, `career/plan`, opportunities list/detail.
- 6 SSRF vectors rejected through `POST /api/ai/jobs/analyze`: metadata IP, loopback, `localhost`, private range, `file://`, `127.0.0.1.nip.io`.
- Quota summary correct across all 6 features after the fix; rewarded-ad start → 403 with no provider.

---

## 6. Remaining work

### ❌ Frontend (Angular) — highest priority
Only the default CLI shell exists (`app.ts`, `app.html`, `app.routes.ts`, `styles.scss`).
Nothing consumes the API yet. Still required:
- Design system: `#035c80` brand, light/dark/system themes, admin-configurable branding
  (already served by `GET /api/bootstrap`) actually applied at runtime.
- Auth screens, guarded shell, session/refresh interceptor, error surface.
- Profile & portfolio editors, public portfolio page with SEO/Open Graph meta.
- CV library + editor (reorder, duplicate, rename, save), template picker, PDF download.
- AI chat UI (markdown, copy, stop generation, conversation rail), job analysis,
  cover letter, career plan panels, quota meter and over-quota dialog.
- Admin console UI for the endpoints in §3.7 and §3.5 (providers/models/routes, users,
  audit log, quota policies, branding, analytics, payment settings) — **backend ready**.
- `apps/web/proxy.conf.json` (referenced in scripts, still missing).
- Frontend component/form/service/guard tests.

### ❌ Billing (PayPal + FedaPay)
`transactions` and `processed_webhooks` tables plus settings keys exist; **no module**.
Needs: provider clients, create-order endpoint, webhook endpoints with signature
verification, idempotency via `processed_webhooks`, transaction log API, admin UI.
Must never mark a payment paid from a frontend response.

### ❌ File uploads
`file_assets` entity exists; no controller/service. Needs MIME + extension + magic-byte
validation, size caps, safe generated names, path-traversal protection, a storage
abstraction (local now, object storage later), and DB metadata.

### ❌ Interview preparation
Not implemented. Job analysis already returns `interviewQuestions`; a dedicated
`interview-prep` endpoint (behavioural/technical question sets with STAR guidance) is
still needed to satisfy the stated scope.

### ❌ Admin console UI (backend now done, see §3.7)

### ❌ Contacts / opportunities UI surface
Backend CRUD for `contact_messages` is absent (entity only); opportunities are API-only.

### ❌ Marketing pages & public site
Portfolio public page is API-only. Marketing/landing pages, sitemap, robots.

### ❌ Docs and ops
`README.md` is one line — install-on-a-fresh-machine and VPS deployment docs are required.
`.env.example` (74 lines) exists and is current.

### 🟡 Security & performance sign-off
Automated security testing (ZAP or equivalent) and a written findings report have **not**
been run. Performance work (lazy loading, pagination, index review) is partially in place
server-side but untested under load.

---

## 7. External configuration needed

| Variable | Purpose | Current state |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Initial super-admin password | Not in `.env`; must be set before a production seed |
| `SMTP_*` | Verification / reset emails | Unset → emails are logged to console only |
| `REWARDED_AD_PROVIDER`, `REWARDED_AD_SECRET` | Rewarded-video credits | Unset → feature cleanly disabled (correct behaviour) |
| `PAYPAL_*`, `FEDAPAY_*` | Payments | Unset; settable via admin settings panel |
| `PUBLIC_APP_URL` | Absolute URLs in emails / SEO | Unset |

No AI provider is configured by default. Until an admin adds one, AI endpoints return
`503 AI_UNAVAILABLE` with a clear message — intended behaviour, not a bug.

---

## 8. Decisions worth remembering

- **NestJS 11 LTS** rather than 12 (12 is ESM-only; avoided the migration churn).
- **Migrations only**, never `synchronize`, so deployments are reproducible.
- **DB-backed sessions with `sid`** + refresh rotation + replay-family revocation.
- **Argon2id** over bcrypt.
- **Hex colours only** in the PDF engine (see §3.4).
- **Quota split by ledger `reason`**, not by delta sign (see §4.1). Any future ledger
  reason must be classified as usage or grant, or it will be silently ignored.
- **Untrusted web content is data, never instructions** — enforced in code and prompt.
- **Rewarded ads and payments are never credited client-side.**
- Paginated list endpoints return `{items, meta}`; everything else returns `{data}`.
