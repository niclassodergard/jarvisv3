import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { Repo } from "../db.ts";
import { runAgent, type AgentDeps } from "../agent/loop.ts";

export interface ChatDeps extends Omit<AgentDeps, "system"> {
  buildSystem: () => Anthropic.TextBlockParam[];
  title: (firstUserText: string, assistantText: string) => Promise<string | null>;
  /** In-flight agent runs by conversation id; shared so deleting a conversation can abort its run. */
  runs: Map<string, AbortController>;
}

const DEFAULT_TITLE = "New chat";

export function chatRoutes(deps: ChatDeps) {
  const { repo, runs } = deps;
  const app = new Hono();

  app.post("/:id/messages", async (c) => {
    const id = c.req.param("id");
    const body = z.object({ text: z.string().trim().min(1).max(100_000) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Invalid message" }, 400);
    const conv = repo.getConversation(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    if (runs.has(id)) return c.json({ error: "A reply is already in progress" }, 409);

    repo.addMessage(id, "user", [{ type: "text", text: body.data.text }]);
    const ctrl = new AbortController();
    runs.set(id, ctrl);
    const release = () => {
      if (runs.get(id) === ctrl) runs.delete(id);
    };

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => ctrl.abort());
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      try {
        await runAgent(
          { ...deps, system: deps.buildSystem() },
          id,
          (e) => void send(e.type, e).catch(() => {}),
          ctrl.signal,
        );
        // The reply is finished: free the conversation before the (slower) title call.
        release();
        const current = repo.getConversation(id);
        if (current?.title === DEFAULT_TITLE && !ctrl.signal.aborted) {
          const reply = repo
            .getMessages(id)
            .filter((m) => m.role === "assistant")
            .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("");
          if (reply.trim()) {
            const title = await deps.title(body.data.text, reply).catch((e) => {
              console.error("title error", e);
              return null;
            });
            if (title && repo.renameConversation(id, title)) await send("title", { title });
          }
        }
      } catch (err) {
        console.error("chat error", err);
        await send("error", { message: err instanceof Error ? err.message : "Unknown error" }).catch(() => {});
      } finally {
        release();
      }
    });
  });

  return app;
}
