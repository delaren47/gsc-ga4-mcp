import http from "node:http";
import { URL } from "node:url";
import { createOAuth2Client, saveOAuthTokens, SCOPES } from "./auth.js";

const PORT = Number(process.env.OAUTH_PORT ?? "3000");
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `http://127.0.0.1:${PORT}/oauth2callback`;

async function main() {
  const client = createOAuth2Client(REDIRECT_URI);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? "/", REDIRECT_URI);
      if (reqUrl.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const code = reqUrl.searchParams.get("code");
      if (!code) throw new Error("No authorization code received.");
      const { tokens } = await client.getToken(code);
      saveOAuthTokens(tokens);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Authorization complete. You can close this tab and return to your terminal.");
      server.close();
      console.log("OAuth token saved successfully.");
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : String(error));
      server.close();
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log("\nOpen this URL in your browser and approve read-only access:\n");
    console.log(authUrl);
    console.log("\nWaiting for Google OAuth callback...\n");
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
