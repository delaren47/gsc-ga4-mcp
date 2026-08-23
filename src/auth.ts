import fs from "node:fs";
import path from "node:path";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { env, optionalEnv, SCOPES } from "./config.js";

type OAuthClientFile = {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
};

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function readOAuthClientFile(): OAuthClientFile {
  const filePath = env("GOOGLE_OAUTH_CREDENTIALS_FILE");
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

export function createOAuth2Client(redirectUri?: string): OAuth2Client {
  const credentials = readOAuthClientFile();
  const client = credentials.installed ?? credentials.web;
  if (!client) {
    throw new Error("OAuth credentials JSON must contain an installed or web client.");
  }
  const uri =
    redirectUri ??
    optionalEnv("GOOGLE_OAUTH_REDIRECT_URI") ??
    client.redirect_uris?.[0] ??
    "http://127.0.0.1:3000/oauth2callback";
  return new OAuth2Client(client.client_id, client.client_secret, uri);
}

export function saveOAuthTokens(tokens: object): void {
  const tokenPath = env("GOOGLE_TOKEN_PATH");
  ensureDir(tokenPath);
  fs.writeFileSync(path.resolve(tokenPath), JSON.stringify(tokens, null, 2));
}

export async function getAuthClient() {
  const mode = (process.env.GOOGLE_AUTH_MODE ?? "oauth").toLowerCase();
  if (mode === "service_account") {
    const auth = new GoogleAuth({
      keyFile: env("GOOGLE_SERVICE_ACCOUNT_KEY_FILE"),
      scopes: SCOPES
    });
    return auth.getClient();
  }

  const tokenPath = env("GOOGLE_TOKEN_PATH");
  const client = createOAuth2Client();
  if (!fs.existsSync(path.resolve(tokenPath))) {
    throw new Error(`OAuth token not found at ${tokenPath}. Run: npm run auth`);
  }
  client.setCredentials(JSON.parse(fs.readFileSync(path.resolve(tokenPath), "utf8")));
  return client;
}

export { SCOPES };
