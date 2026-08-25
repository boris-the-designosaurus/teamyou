import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

/**
 * Dev-only middleware that mounts the same serverless handler used in
 * production (`api/coach.ts`) at POST /api/coach, so `npm run dev` proves the
 * full round-trip in one process. In production (e.g. Vercel) the file in
 * `api/` is deployed as a serverless function directly; this plugin is a no-op
 * outside `vite dev`.
 */
function coachApiPlugin(): Plugin {
  return {
    name: "teamyou-coach-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/coach", (req, res, next) => {
        if (req.method !== "POST") return next();

        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", async () => {
          try {
            const mod = await server.ssrLoadModule("/api/coach.ts");
            const body = raw ? JSON.parse(raw) : {};
            const result = await mod.runCoach(body);
            res.statusCode = result.status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(result.json));
          } catch (err) {
            // Fail loudly in dev — surface the real error to the client.
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({
                error: "coach_server_error",
                message: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        });
      });
      server.middlewares.use("/api/pattern-thumbnail", async (req, res, next) => {
        if (req.method !== "GET") return next();
        try {
          const requestUrl = new URL(req.url ?? "", "http://localhost");
          const mod = await server.ssrLoadModule("/api/pattern-thumbnail.ts");
          const result = await mod.fetchPatternThumbnail(
            requestUrl.searchParams.get("url") ?? undefined,
            requestUrl.searchParams.get("force") === "true",
          );
          res.statusCode = result.status;
          res.setHeader("content-type", result.contentType);
          res.setHeader("cache-control", result.cacheControl ?? "no-store");
          res.end(Buffer.from(result.body));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            error: "pattern_thumbnail_error",
            message: err instanceof Error ? err.message : String(err),
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load .env (all keys, no VITE_ prefix filter) into process.env so the
  // dev middleware can read ANTHROPIC_API_KEY without a prefix.
  const env = loadEnv(mode, process.cwd(), "");
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  }
  if (env.COACH_MODEL && !process.env.COACH_MODEL) {
    process.env.COACH_MODEL = env.COACH_MODEL;
  }
  if (env.PATTERN_WEB_SEARCH && !process.env.PATTERN_WEB_SEARCH) {
    process.env.PATTERN_WEB_SEARCH = env.PATTERN_WEB_SEARCH;
  }

  return {
    plugins: [
      // Single-color icons use a neutral #57534E / #1F1F1F — map it to
      // currentColor so they inherit --icon-* tokens. Multi-color badges keep
      // their fills untouched.
      svgr({
        svgrOptions: {
          replaceAttrValues: {
            "#57534E": "currentColor",
            "#57534e": "currentColor",
            "#59524D": "currentColor",
            "#59524d": "currentColor",
            "#1F1F1F": "currentColor",
            "#1f1f1f": "currentColor",
            "#616873": "currentColor",
            black: "currentColor",
          },
        },
      }),
      react(),
      coachApiPlugin(),
    ],
  };
});
