import { ga4RunReport, gscSearchAnalytics, GscRow } from "./google.js";

function pathFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.replace(/^https?:\/\/[^/]+/i, "").replace(/\/$/, "") || "/";
  }
}

function metric(row: any, index: number): number {
  return Number(row.metricValues?.[index]?.value ?? 0);
}

export async function highImpressionLowCtrPages(input: {
  siteUrl?: string;
  startDate: string;
  endDate: string;
  minImpressions?: number;
  maxCtr?: number;
  rowLimit?: number;
}) {
  const result: any = await gscSearchAnalytics({
    siteUrl: input.siteUrl,
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: ["page"],
    rowLimit: input.rowLimit ?? 5000
  });
  const minImpressions = input.minImpressions ?? 500;
  const maxCtr = input.maxCtr ?? 0.02;
  const rows = (result.rows ?? []) as GscRow[];
  return rows
    .filter((row) => (row.impressions ?? 0) >= minImpressions && (row.ctr ?? 0) <= maxCtr)
    .map((row) => ({
      page: row.keys?.[0],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
      opportunityScore: Math.round((row.impressions ?? 0) * (maxCtr - (row.ctr ?? 0) + 0.001))
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

export async function compareGscGa4Pages(input: {
  siteUrl?: string;
  property?: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
}) {
  const [gsc, ga4]: any[] = await Promise.all([
    gscSearchAnalytics({
      siteUrl: input.siteUrl,
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ["page"],
      rowLimit: input.rowLimit ?? 5000
    }),
    ga4RunReport({
      property: input.property,
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ["landingPagePlusQueryString"],
      metrics: ["sessions", "engagedSessions", "engagementRate"],
      limit: input.rowLimit ?? 5000
    })
  ]);

  const gaByPath = new Map<string, any>();
  for (const row of ga4.rows ?? []) {
    const landingPage = row.dimensionValues?.[0]?.value ?? "/";
    gaByPath.set(pathFromUrl(landingPage), {
      landingPage,
      sessions: metric(row, 0),
      engagedSessions: metric(row, 1),
      engagementRate: metric(row, 2)
    });
  }

  return ((gsc.rows ?? []) as GscRow[]).map((row: GscRow) => {
    const page = row.keys?.[0] ?? "";
    const path = pathFromUrl(page);
    const ga = gaByPath.get(path);
    return {
      page,
      path,
      gscClicks: row.clicks ?? 0,
      gscImpressions: row.impressions ?? 0,
      gscCtr: row.ctr ?? 0,
      gscPosition: row.position ?? 0,
      ga4Sessions: ga?.sessions ?? 0,
      ga4EngagedSessions: ga?.engagedSessions ?? 0,
      ga4EngagementRate: ga?.engagementRate ?? null
    };
  });
}

export async function pagesWithClicksButLowEngagement(input: {
  siteUrl?: string;
  property?: string;
  startDate: string;
  endDate: string;
  minClicks?: number;
  maxEngagementRate?: number;
  rowLimit?: number;
}) {
  const rows = await compareGscGa4Pages(input);
  const minClicks = input.minClicks ?? 20;
  const maxEngagementRate = input.maxEngagementRate ?? 0.35;
  return rows
    .filter((row: Awaited<ReturnType<typeof compareGscGa4Pages>>[number]) => row.gscClicks >= minClicks && (row.ga4EngagementRate ?? 1) <= maxEngagementRate)
    .sort((a: Awaited<ReturnType<typeof compareGscGa4Pages>>[number], b: Awaited<ReturnType<typeof compareGscGa4Pages>>[number]) => b.gscClicks - a.gscClicks);
}

export async function contentRefreshCandidates(input: {
  siteUrl?: string;
  property?: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
}) {
  const rows = await compareGscGa4Pages(input);
  return rows
    .map((row: Awaited<ReturnType<typeof compareGscGa4Pages>>[number]) => ({
      ...row,
      refreshScore:
        row.gscImpressions * Math.max(0, 0.08 - row.gscCtr) +
        row.gscClicks * Math.max(0, 0.5 - (row.ga4EngagementRate ?? 0.5)) * 10
    }))
    .filter((row: Awaited<ReturnType<typeof compareGscGa4Pages>>[number] & { refreshScore: number }) => row.refreshScore > 0)
    .sort((a: Awaited<ReturnType<typeof compareGscGa4Pages>>[number] & { refreshScore: number }, b: Awaited<ReturnType<typeof compareGscGa4Pages>>[number] & { refreshScore: number }) => b.refreshScore - a.refreshScore);
}
