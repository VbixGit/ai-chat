/**
 * Vercel Serverless Function — Weaviate GraphQL Proxy
 *
 * Routes:  POST /api/weaviate
 * Purpose: Forwards the GraphQL body to the Weaviate instance server-side,
 *          adding the API-key header.  Because this runs on Vercel's edge
 *          (server → server) there is no CORS restriction.
 *
 * Environment variables required in Vercel dashboard:
 *   REACT_APP_WEAVIATE_ENDPOINT   e.g. https://weaviate.vbix.net
 *   REACT_APP_WEAVIATE_API_KEY    your Weaviate API key
 *   CF_ACCESS_CLIENT_ID           Cloudflare Access service token client ID
 *   CF_ACCESS_CLIENT_SECRET       Cloudflare Access service token client secret
 */

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const endpoint = (process.env.REACT_APP_WEAVIATE_ENDPOINT || "").replace(
    /\/+$/,
    "",
  );
  const apiKey = process.env.REACT_APP_WEAVIATE_API_KEY || "";
  const cfClientId = process.env.CF_ACCESS_CLIENT_ID || "";
  const cfClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";

  if (!endpoint) {
    return res
      .status(500)
      .json({ error: "REACT_APP_WEAVIATE_ENDPOINT is not configured." });
  }

  const upstreamUrl = `${endpoint}/v1/graphql`;

  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    // Cloudflare Access service token (bypasses Cloudflare Access 403)
    if (cfClientId) headers["CF-Access-Client-Id"] = cfClientId;
    if (cfClientSecret) headers["CF-Access-Client-Secret"] = cfClientSecret;

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();

    res.setHeader("Content-Type", "application/json");
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("[api/weaviate] Upstream error:", err.message);
    return res.status(502).json({ error: `Upstream error: ${err.message}` });
  }
}
