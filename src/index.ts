import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ga4AccountSummaries,
  ga4RunRealtimeReport,
  ga4RunReport,
  gscListSites,
  gscSearchAnalytics,
  gscUrlInspection
} from "./google.js";
import { contentRefreshCandidates, compareGscGa4Pages, highImpressionLowCtrPages, pagesWithClicksButLowEngagement } from "./analysis.js";
import { findProject, readProjectsConfig } from "./config.js";

const server = new McpServer({
  name: "gsc-ga4-seo-mcp",
  version: "0.1.0"
});

function text(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

const dateRange = {
  startDate: z.string().describe("YYYY-MM-DD"),
  endDate: z.string().describe("YYYY-MM-DD")
};

const gscSite = {
  siteUrl: z.string().optional().describe("GSC property, e.g. sc-domain:example.com or https://www.example.com/")
};

const ga4Property = {
  property: z.string().optional().describe("GA4 property, e.g. properties/123456789 or 123456789")
};

server.tool("project_mappings", "List local domain/client mappings from PROJECTS_CONFIG.", {}, async () => text({ projects: readProjectsConfig() }));

server.tool(
  "project_lookup",
  "Find a local project mapping by project name, client, or domain.",
  { nameOrDomain: z.string() },
  async ({ nameOrDomain }) => text(findProject(nameOrDomain) ?? { found: false })
);

server.tool("gsc_list_sites", "List Google Search Console sites visible to the current credentials.", {}, async () => text(await gscListSites()));

server.tool(
  "gsc_search_analytics",
  "Run a raw Search Console Search Analytics query.",
  {
    ...gscSite,
    ...dateRange,
    dimensions: z.array(z.string()).default(["query"]),
    rowLimit: z.number().int().positive().optional(),
    startRow: z.number().int().nonnegative().optional(),
    type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).optional()
  },
  async (args) => text(await gscSearchAnalytics(args))
);

server.tool(
  "gsc_top_queries",
  "Top GSC queries by clicks/impressions.",
  { ...gscSite, ...dateRange, rowLimit: z.number().int().positive().default(100) },
  async (args) => text(await gscSearchAnalytics({ ...args, dimensions: ["query"] }))
);

server.tool(
  "gsc_top_pages",
  "Top GSC pages by clicks/impressions.",
  { ...gscSite, ...dateRange, rowLimit: z.number().int().positive().default(100) },
  async (args) => text(await gscSearchAnalytics({ ...args, dimensions: ["page"] }))
);

server.tool(
  "gsc_query_page_matrix",
  "GSC query/page matrix for finding page-level keyword opportunities.",
  { ...gscSite, ...dateRange, rowLimit: z.number().int().positive().default(1000) },
  async (args) => text(await gscSearchAnalytics({ ...args, dimensions: ["query", "page"] }))
);

server.tool(
  "gsc_url_inspection",
  "Inspect Google index status for a URL under a GSC property.",
  {
    ...gscSite,
    inspectionUrl: z.string().url(),
    languageCode: z.string().optional()
  },
  async (args) => text(await gscUrlInspection(args))
);

server.tool("ga4_list_properties", "List GA4 accounts and property summaries visible to the credentials.", {}, async () => text(await ga4AccountSummaries()));

server.tool(
  "ga4_run_report",
  "Run a raw GA4 Data API report.",
  {
    ...ga4Property,
    ...dateRange,
    dimensions: z.array(z.string()),
    metrics: z.array(z.string()),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional()
  },
  async (args) => text(await ga4RunReport(args))
);

server.tool(
  "ga4_top_pages",
  "Top GA4 pages by views, users, and sessions.",
  { ...ga4Property, ...dateRange, limit: z.number().int().positive().default(100) },
  async (args) =>
    text(
      await ga4RunReport({
        ...args,
        dimensions: ["pagePathPlusQueryString", "pageTitle"],
        metrics: ["screenPageViews", "activeUsers", "sessions"]
      })
    )
);

server.tool(
  "ga4_traffic_sources",
  "GA4 traffic sources by default channel group and source/medium.",
  { ...ga4Property, ...dateRange, limit: z.number().int().positive().default(100) },
  async (args) =>
    text(
      await ga4RunReport({
        ...args,
        dimensions: ["sessionDefaultChannelGroup", "sessionSourceMedium"],
        metrics: ["sessions", "activeUsers", "engagedSessions", "conversions"]
      })
    )
);

server.tool(
  "ga4_landing_pages",
  "GA4 landing pages with engagement metrics.",
  { ...ga4Property, ...dateRange, limit: z.number().int().positive().default(100) },
  async (args) =>
    text(
      await ga4RunReport({
        ...args,
        dimensions: ["landingPagePlusQueryString"],
        metrics: ["sessions", "engagedSessions", "engagementRate"]
      })
    )
);

server.tool(
  "ga4_events",
  "GA4 events by event name.",
  { ...ga4Property, ...dateRange, limit: z.number().int().positive().default(100) },
  async (args) =>
    text(
      await ga4RunReport({
        ...args,
        dimensions: ["eventName"],
        metrics: ["eventCount", "activeUsers"]
      })
    )
);

server.tool(
  "ga4_realtime",
  "GA4 realtime active users report.",
  {
    ...ga4Property,
    dimensions: z.array(z.string()).default(["unifiedScreenName"]),
    metrics: z.array(z.string()).default(["activeUsers"]),
    limit: z.number().int().positive().default(100)
  },
  async (args) => text(await ga4RunRealtimeReport(args))
);

server.tool(
  "find_high_impression_low_ctr_pages",
  "Find GSC pages with high impressions and low CTR.",
  {
    ...gscSite,
    ...dateRange,
    minImpressions: z.number().positive().default(500),
    maxCtr: z.number().positive().max(1).default(0.02),
    rowLimit: z.number().int().positive().default(5000)
  },
  async (args) => text(await highImpressionLowCtrPages(args))
);

server.tool(
  "compare_gsc_ga4_pages",
  "Join GSC page performance with GA4 landing-page engagement.",
  { ...gscSite, ...ga4Property, ...dateRange, rowLimit: z.number().int().positive().default(5000) },
  async (args) => text(await compareGscGa4Pages(args))
);

server.tool(
  "find_pages_with_clicks_but_low_engagement",
  "Find pages with GSC clicks but weak GA4 engagement.",
  {
    ...gscSite,
    ...ga4Property,
    ...dateRange,
    minClicks: z.number().positive().default(20),
    maxEngagementRate: z.number().positive().max(1).default(0.35),
    rowLimit: z.number().int().positive().default(5000)
  },
  async (args) => text(await pagesWithClicksButLowEngagement(args))
);

server.tool(
  "content_refresh_candidates",
  "Rank pages that may deserve a content refresh based on GSC opportunity and GA4 engagement.",
  { ...gscSite, ...ga4Property, ...dateRange, rowLimit: z.number().int().positive().default(5000) },
  async (args) => text(await contentRefreshCandidates(args))
);

server.tool(
  "seo_opportunity_report",
  "Compact SEO opportunity report combining high-impression/low-CTR and low-engagement candidates.",
  { ...gscSite, ...ga4Property, ...dateRange, rowLimit: z.number().int().positive().default(5000) },
  async (args) =>
    text({
      highImpressionLowCtrPages: await highImpressionLowCtrPages(args),
      pagesWithClicksButLowEngagement: await pagesWithClicksButLowEngagement(args),
      contentRefreshCandidates: await contentRefreshCandidates(args)
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
