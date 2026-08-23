import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly"
];

export type ProjectMapping = {
  name: string;
  client?: string;
  domain?: string;
  gscSiteUrl?: string;
  ga4Property?: string;
  notes?: string;
};

export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function maxRows(): number {
  const parsed = Number(process.env.MAX_ROWS ?? "25000");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25000;
}

export function normalizeProperty(property?: string): string {
  const value = property ?? optionalEnv("MCP_DEFAULT_GA4_PROPERTY");
  if (!value) throw new Error("GA4 property is required. Example: properties/123456789");
  return value.startsWith("properties/") ? value : `properties/${value}`;
}

export function normalizeSiteUrl(siteUrl?: string): string {
  const value = siteUrl ?? optionalEnv("MCP_DEFAULT_GSC_SITE");
  if (!value) throw new Error("GSC siteUrl is required. Example: sc-domain:example.com or https://www.example.com/");
  return value;
}

export function readProjectsConfig(): ProjectMapping[] {
  const configPath = optionalEnv("PROJECTS_CONFIG");
  if (!configPath) return [];
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) return [];
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return Array.isArray(parsed.projects) ? parsed.projects : [];
}

export function findProject(nameOrDomain: string): ProjectMapping | undefined {
  const needle = nameOrDomain.toLowerCase();
  return readProjectsConfig().find((project) =>
    [project.name, project.domain, project.client]
      .filter(Boolean)
      .some((value) => value!.toLowerCase() === needle || value!.toLowerCase().includes(needle))
  );
}
