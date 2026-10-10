import { Hono } from "hono";
import { z } from "zod";
import type { Repo } from "../db.ts";

export function conversationRoutes(repo: Repo) {
  const app = new Hono();

  app.get("/", (c) => c.json(repo.listConversations()));
  app.post("/", (c) => c.json(repo.createConversation(), 201));

  app.get("/:id", (c) => {
    const conv = repo.getConversation(c.req.param("id"));
    if (!conv) return c.json({ error: "Not found" }, 404);
    return c.json({ ...conv, messages: repo.getMessages(conv.id) });
  });

  app.patch("/:id", async (c) => {
    const body = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Invalid title" }, 400);
    if (!repo.renameConversation(c.req.param("id"), body.data.title)) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  app.delete("/:id", (c) => {
    if (!repo.deleteConversation(c.req.param("id"))) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
