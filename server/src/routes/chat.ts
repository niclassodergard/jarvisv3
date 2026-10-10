import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { Repo } from "../db.ts";
import { runAgent, type AgentDeps } from "../agent/loop.ts";

export interface ChatDeps extends Omit<AgentDeps, "system"> {
  buildSystem: () => Anthropic.TextBlockParam[];
  title: (firstUserText: string, assistantText: string) => Promise<string | null>;
}

export function chatRoutes(deps: ChatDeps) {
  const { repo } = deps;
  const app = new Hono();
  const active = new Set<string>();

  app.post("/:id/messages", async (c) => {
    const id = c.req.param("id");
    const body = z.object({ text: z.string().trim().min(1).max(100_000) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Invalid message" }, 400);
    const conv = repo.getConversation(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    if (active.has(id)) return c.json({ error: "A reply is already in progress" }, 409);

    const isFirst = repo.getMessages(id).length === 0;
    repo.addMessage(id, "user", [{ type: "text", text: body.data.text }]);
    active.add(id);

    return streamSSE(c, async (stream) => {
      const ctrl = new AbortController();
      stream.onAbort(() => ctrl.abort());
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      try {
        await runAgent(
          { ...deps, system: deps.buildSystem() },
          id,
          (e) => void send(e.type, e).catch(() => {}),
          ctrl.signal,
        );
        if (isFirst && !ctrl.signal.aborted) {
          const msgs = repo.getMessages(id);
          const reply = msgs
            .filter((m) => m.role === "assistant")
            .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("");
          const title = await deps.title(body.data.text, reply).catch((e) => {
            console.error("title error", e);
            return null;
          });
          if (title) {
            repo.renameConversation(id, title);
            await send("title", { title });
          }
        }
      } catch (err) {
        console.error("chat error", err);
        await send("error", { message: err instanceof Error ? err.message : "Unknown error" }).catch(() => {});
      } finally {
        active.delete(id);
      }
    });
  });

  return app;
}
