import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "./config.ts";
import { openDb, Repo } from "./db.ts";
import { conversationRoutes } from "./routes/conversations.ts";
import { chatRoutes } from "./routes/chat.ts";
import { buildSystem } from "./agent/prompt.ts";
import { tools } from "./tools/index.ts";

const config = loadConfig();
const repo = new Repo(openDb(config.DB_PATH));
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

async function makeTitle(user: string, assistant: string): Promise<string | null> {
  const res = await client.messages.create({
    model: config.JARVIS_MODEL,
    max_tokens: 40,
    output_config: { effort: "low" },
    thinking: { type: "between_tools" } as never,
    messages: [
      {
        role: "user",
        content: `Write a title of at most 5 words for this conversation. Reply with the title only, no quotes.\n\nUser: ${user.slice(0, 500)}\n\nAssistant: ${assistant.slice(0, 500)}`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  const title = block && block.type === "text" ? block.text.trim().replace(/^["']|["']$/g, "") : "";
  return title ? title.slice(0, 80) : null;
}

const app = new Hono();
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/conversations", conversationRoutes(repo));
app.route(
  "/api/conversations",
  chatRoutes({
    client: client as never,
    repo,
    tools,
    model: config.JARVIS_MODEL,
    effort: config.JARVIS_EFFORT,
    timezone: config.TZ,
    buildSystem: () => buildSystem(config.TZ),
    title: makeTitle,
  }),
);

const webDir = resolve(config.WEB_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)));
if (existsSync(webDir)) {
  const indexHtml = readFileSync(resolve(webDir, "index.html"), "utf8");
  app.use("/*", serveStatic({ root: relative(process.cwd(), webDir) || "." }));
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.notFound() : c.html(indexHtml)));
} else {
  console.warn(`Web build not found at ${webDir}; serving API only`);
}

serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) => {
  console.log(`Jarvis listening on http://${info.address}:${info.port}`);
});
