# gsc-ga4-mcp

Local MCP server that gives Claude Code read-only access to Google Search Console and GA4 over stdio. It exposes 20 tools — GSC-only, GA4-only, and combined tools that join the two datasets by URL path — plus a project-mapping lookup so a prompt can name a domain instead of a raw property ID. It runs on this machine, calls Google's APIs directly, and has no database, backend, or telemetry.

## Commands

- `npm install` then `npm run build` (`tsc` → `dist/`). `dist/` is gitignored, so a fresh clone has no runnable entry point until this is done.
- `npm run dev` — `tsx src/index.ts`, runs the server from TypeScript with no build. It speaks MCP over stdio, so run by hand it just waits on stdin; that is not a hang.
- `npm start` — `node dist/index.js`. The same command Claude Code launches.
- `npm run auth` — one-time OAuth. Listens on `127.0.0.1:3000` (`OAUTH_PORT` overrides), prints a Google consent URL, writes the token to `GOOGLE_TOKEN_PATH`.
- **There is no test suite and no `test` script.** Do not invent `npm test`. `npm run build` is the only automated check — TypeScript `strict` type errors are the gate.

## Architecture and constraints

- TypeScript, ESM (`"type": "module"`, `module: NodeNext`). Intra-`src/` imports must carry the `.js` extension.
- Read-only is enforced by OAuth scope, not by a code-level write guard: `SCOPES` in `src/config.ts` requests only `webmasters.readonly` and `analytics.readonly`. Several read endpoints are POSTs (`searchAnalytics/query`, `:runReport`, `urlInspection`) — POST here does not mean write. **IMPORTANT: never widen `SCOPES` when adding a tool.**
- Credentials never live in the repo. `.env` (gitignored, present locally) supplies the names only: `GOOGLE_AUTH_MODE` (`oauth` | `service_account`), `GOOGLE_OAUTH_CREDENTIALS_FILE`, `GOOGLE_TOKEN_PATH`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `PROJECTS_CONFIG`, `MCP_DEFAULT_GSC_SITE`, `MCP_DEFAULT_GA4_PROPERTY`, `MAX_ROWS`. The files those point at sit in `~/.config/gsc-ga4-mcp/`.
- Never read `.env`, `token.json`, `oauth-client.json`, a service-account key, or the real `projects.json` into a transcript, a commit, or a document. Edit the `.example` files instead.
- Every path in `.env` must be absolute. `~` is not expanded anywhere in the code.
- `projects.json` (located by `PROJECTS_CONFIG`) maps a project/client/domain name to its `gscSiteUrl` and `ga4Property`, which is what `project_lookup` and `project_mappings` read. It is gitignored because it holds real client property IDs; `projects.example.json` is the committed template. Lookup matches name, domain or client by case-insensitive substring.

## Wiring into Claude Code

- Registered at **user scope** via the CLI, server name `google-seo`, running `node ~/AI/gsc-ga4-mcp/dist/index.js` (the registration stores the absolute path; `~` here is shorthand). It is therefore live in every repo, not only this one. Its env comes from `.env` beside the code, so the registration itself carries no property IDs.
- `.mcp.example.json` is the alternative project-scoped pattern (inline `env` block). It is a template — there is no live `.mcp.json` in this repo.
- Check it is up with `claude mcp list` (expect `google-seo: … ✔ Connected`), then `/mcp` inside Claude Code for the tool list. Never `claude mcp get`.

## Verification after a change

1. `npm run build` exits clean.
2. Restart Claude Code — the registered command points at `dist/`, and a running server keeps the old build.
3. `claude mcp list` shows `✔ Connected`.
4. Call one cheap live tool (`project_mappings`, or `gsc_list_sites` for an auth check) and confirm real output.

## Gotchas

- Editing `src/` alone changes nothing for the running server. Rebuild, then restart Claude Code.
- `sc-domain:example.com` and `https://www.example.com/` are different GSC properties. A "missing" site is usually the wrong form, not missing access.
- `gsc_url_inspection` needs the inspected URL to sit inside `siteUrl`, and URL-prefix properties must end in `/`.
- GA4 `runReport` rejects any dimension or metric name outside the official API list — no guessing.
- `MAX_ROWS` (default 25000) caps response size. Lower it when tool output floods the context.
- The GitHub remote (`delaren47/gsc-ga4-mcp`, MIT) is public. Client property IDs, client domains, and analytics output must never reach a commit, an issue, or the README.
