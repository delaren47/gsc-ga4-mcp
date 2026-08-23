# gsc-ga4-mcp

A small local MCP server that gives Claude Code read-only access to Google Search Console and GA4, plus a few tools that cross the two datasets.

## The problem

SEO work in an AI assistant usually means exporting CSVs from Search Console, exporting more CSVs from GA4, pasting both into a chat, and repeating that every time you want a fresh number. The two datasets also never line up on their own: Search Console knows impressions, clicks and CTR; GA4 knows sessions, engagement and conversions. Answering "which pages get traffic but waste it" means joining them by URL by hand.

Google publishes an official MCP server for Analytics, but it does not cover Search Console. Community Search Console servers exist, but if the data belongs to clients, running a small wrapper you can read end to end beats trusting someone else's.

This server calls the official Google APIs directly, with read-only scopes, from your own machine.

## What it does

Twenty MCP tools over `stdio`.

**Search Console**

| Tool | Purpose |
| --- | --- |
| `gsc_list_sites` | Sites visible to the current credentials |
| `gsc_search_analytics` | Raw `searchAnalytics.query` with your own dimensions and filters |
| `gsc_top_queries` | Top queries for a date range |
| `gsc_top_pages` | Top pages for a date range |
| `gsc_query_page_matrix` | Query × page breakdown |
| `gsc_url_inspection` | Index status of a single URL |

**GA4**

| Tool | Purpose |
| --- | --- |
| `ga4_list_properties` | Accounts and property summaries |
| `ga4_run_report` | Raw `runReport` with your own dimensions and metrics |
| `ga4_top_pages` | Pages by sessions/views |
| `ga4_traffic_sources` | Sessions by source/medium |
| `ga4_landing_pages` | Landing pages with engagement metrics |
| `ga4_events` | Event counts |
| `ga4_realtime` | Last 30 minutes of activity |

**Combined analysis**

| Tool | Purpose |
| --- | --- |
| `seo_opportunity_report` | One pass over both APIs, grouped into quick wins and rewrites |
| `compare_gsc_ga4_pages` | Joins GSC pages to GA4 pages by URL path |
| `find_high_impression_low_ctr_pages` | Ranking but not earning the click |
| `find_pages_with_clicks_but_low_engagement` | Earning the click, losing the visitor |
| `content_refresh_candidates` | Pages whose performance has decayed |

**Config**

`project_mappings` and `project_lookup` read a local file that maps a project or client name to its GSC property and GA4 property, so you can say "cross GSC and GA4 for example.com" instead of remembering `properties/123456789`.

## Stack

Node.js + TypeScript. `@modelcontextprotocol/sdk` for the server, `google-auth-library` for auth, `zod` for tool schemas. No database, no hosted backend, no telemetry — the process runs locally and Claude Code launches it over `stdio`.

Scopes are read-only and that is the whole permission surface:

- `https://www.googleapis.com/auth/webmasters.readonly`
- `https://www.googleapis.com/auth/analytics.readonly`

Credentials live outside the repo, by default in `~/.config/gsc-ga4-mcp/`.

## Setup

### 1. Install

```bash
git clone https://github.com/YOUR_USER/gsc-ga4-mcp.git
cd gsc-ga4-mcp
npm install
npm run build
mkdir -p ~/.config/gsc-ga4-mcp
```

### 2. Enable the APIs

In [Google Cloud Console](https://console.cloud.google.com/), create or pick a project, then enable:

- Google Search Console API
- Google Analytics Data API
- Google Analytics Admin API

### 3. Create OAuth credentials

Under **APIs & Services → OAuth consent screen**, configure the consent screen. Use External if the properties you manage are not all in one Google Workspace, and add your own email as a test user while the app is in testing.

Under **APIs & Services → Credentials**, create an OAuth client ID of type **Desktop app**, download the JSON, and save it as `~/.config/gsc-ga4-mcp/oauth-client.json`.

For client work where you want permissions isolated per account, use a service account instead and add its email to each GSC and GA4 property with read access. Set `GOOGLE_AUTH_MODE=service_account` and point `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` at the key.

### 4. Configure

```bash
cp .env.example .env
cp projects.example.json ~/.config/gsc-ga4-mcp/projects.json
```

Paths in `.env` must be absolute — `~` is not expanded.

```bash
GOOGLE_AUTH_MODE=oauth
GOOGLE_OAUTH_CREDENTIALS_FILE=/Users/YOUR_USER/.config/gsc-ga4-mcp/oauth-client.json
GOOGLE_TOKEN_PATH=/Users/YOUR_USER/.config/gsc-ga4-mcp/token.json
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:3000/oauth2callback
PROJECTS_CONFIG=/Users/YOUR_USER/.config/gsc-ga4-mcp/projects.json
MCP_DEFAULT_GSC_SITE=sc-domain:example.com
MCP_DEFAULT_GA4_PROPERTY=properties/123456789
MAX_ROWS=25000
```

Project mappings (`projects.json`):

```json
{
  "projects": [
    {
      "name": "My Site",
      "client": "Internal",
      "domain": "example.com",
      "gscSiteUrl": "sc-domain:example.com",
      "ga4Property": "properties/123456789",
      "notes": "Replace with the real GA4 property ID."
    }
  ]
}
```

### 5. Authorise

```bash
npm run auth
```

The script starts a loopback listener on `127.0.0.1:3000` and prints a Google URL. Open it, approve the read-only scopes, and the token is written to `GOOGLE_TOKEN_PATH`.

### 6. Register with Claude Code

```bash
claude mcp add google-seo -- node /ABSOLUTE/PATH/TO/gsc-ga4-mcp/dist/index.js
claude mcp list
```

Or check a `.mcp.json` into the project where you want the tools (see `.mcp.example.json`):

```json
{
  "mcpServers": {
    "google-seo": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/gsc-ga4-mcp/dist/index.js"],
      "env": {
        "GOOGLE_AUTH_MODE": "oauth",
        "GOOGLE_OAUTH_CREDENTIALS_FILE": "/Users/YOUR_USER/.config/gsc-ga4-mcp/oauth-client.json",
        "GOOGLE_TOKEN_PATH": "/Users/YOUR_USER/.config/gsc-ga4-mcp/token.json",
        "PROJECTS_CONFIG": "/Users/YOUR_USER/.config/gsc-ga4-mcp/projects.json",
        "MCP_DEFAULT_GSC_SITE": "sc-domain:example.com",
        "MCP_DEFAULT_GA4_PROPERTY": "properties/123456789"
      }
    }
  }
}
```

Use the CLI registration when you would rather keep paths and property defaults out of a repo.

## Usage with Claude Code

Ask in plain language; Claude picks the tools.

```text
Use gsc_list_sites and ga4_list_properties. Give me a table of the GSC sites
and GA4 properties I can reach.
```

```text
Analyse organic traffic for sc-domain:example.com over the last 90 days using
gsc_top_queries and gsc_top_pages.
```

```text
Cross GSC and GA4 for example.com over the last 90 days. Find pages with high
impressions and low CTR, and rank the opportunities by likely impact.
```

```text
Run seo_opportunity_report and group the output into quick wins, pages that
need a rewrite, and pages that miss search intent.
```

```text
Inspect https://www.example.com/page/ with gsc_url_inspection and tell me
whether Google has it indexed.
```

## Operating notes

- Keep `.env`, `token.json`, `projects.json` and any service-account key out of version control. The shipped `.gitignore` already covers them.
- Client analytics data is confidential. Do not paste full outputs into tools the client has not approved.
- Revoke the token or the service account when an engagement ends.
- `MAX_ROWS` caps response size. Lower it if replies get unwieldy.

## Troubleshooting

- **Claude Code does not see the tools.** Run `claude mcp list`, then `/mcp` inside Claude Code.
- **OAuth token errors.** Re-run `npm run auth` and confirm `GOOGLE_TOKEN_PATH` is an absolute path.
- **`access_denied`.** Add your email as a test user on the OAuth consent screen while the app is in testing.
- **A domain is missing from GSC.** The credentials need access to that exact property — `sc-domain:example.com` and `https://www.example.com/` are different properties.
- **A GA4 property is missing.** The user or service account needs at least Viewer on the account or property.
- **`gsc_url_inspection` fails.** `inspectionUrl` must sit inside `siteUrl`, and URL-prefix properties must end with `/`.
- **Invalid GA4 metrics.** Use the official GA4 dimension and metric names; `runReport` rejects anything else.

## References

- [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Search Console API](https://developers.google.com/webmaster-tools)
- [GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Google Analytics Admin API](https://developers.google.com/analytics/devguides/config/admin/v1)
- [Google OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

## Licence

MIT. See [LICENSE](LICENSE).
