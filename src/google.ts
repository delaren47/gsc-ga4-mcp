import { getAuthClient } from "./auth.js";
import { maxRows, normalizeProperty, normalizeSiteUrl } from "./config.js";

type HttpMethod = "GET" | "POST";

async function request<T>(method: HttpMethod, url: string, data?: unknown, params?: Record<string, string | number | undefined>): Promise<T> {
  const auth = await getAuthClient();
  const response = await auth.request<T>({
    method,
    url,
    data,
    params
  });
  return response.data;
}

function safeLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? 1000, 1), maxRows());
}

export type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export async function gscListSites() {
  return request("GET", "https://www.googleapis.com/webmasters/v3/sites");
}

export async function gscSearchAnalytics(input: {
  siteUrl?: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  type?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
  dimensionFilterGroups?: unknown[];
}) {
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  const body = {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: input.dimensions ?? ["query"],
    rowLimit: safeLimit(input.rowLimit),
    startRow: input.startRow ?? 0,
    type: input.type ?? "web",
    dimensionFilterGroups: input.dimensionFilterGroups
  };
  return request(
    "POST",
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    body
  );
}

export async function gscUrlInspection(input: { siteUrl?: string; inspectionUrl: string; languageCode?: string }) {
  const body = {
    siteUrl: normalizeSiteUrl(input.siteUrl),
    inspectionUrl: input.inspectionUrl,
    languageCode: input.languageCode ?? "es-MX"
  };
  return request("POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", body);
}

export async function ga4AccountSummaries() {
  const summaries = [];
  let pageToken: string | undefined;
  do {
    const data: any = await request("GET", "https://analyticsadmin.googleapis.com/v1beta/accountSummaries", undefined, {
      pageSize: 200,
      pageToken
    });
    summaries.push(...(data.accountSummaries ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { accountSummaries: summaries };
}

export async function ga4RunReport(input: {
  property?: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  limit?: number;
  offset?: number;
  dimensionFilter?: unknown;
  metricFilter?: unknown;
  orderBys?: unknown[];
}) {
  const property = normalizeProperty(input.property);
  const body = {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    dimensions: input.dimensions.map((name) => ({ name })),
    metrics: input.metrics.map((name) => ({ name })),
    limit: String(safeLimit(input.limit)),
    offset: String(input.offset ?? 0),
    dimensionFilter: input.dimensionFilter,
    metricFilter: input.metricFilter,
    orderBys: input.orderBys
  };
  return request("POST", `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, body);
}

export async function ga4RunRealtimeReport(input: {
  property?: string;
  dimensions?: string[];
  metrics?: string[];
  limit?: number;
}) {
  const property = normalizeProperty(input.property);
  const body = {
    dimensions: (input.dimensions ?? ["unifiedScreenName"]).map((name) => ({ name })),
    metrics: (input.metrics ?? ["activeUsers"]).map((name) => ({ name })),
    limit: String(safeLimit(input.limit))
  };
  return request("POST", `https://analyticsdata.googleapis.com/v1beta/${property}:runRealtimeReport`, body);
}
