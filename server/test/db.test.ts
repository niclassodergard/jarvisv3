import { describe, it, expect } from "vitest";
import { openDb, Repo } from "../src/db.ts";

describe("Repo", () => {
  it("stores conversations and ordered messages with block content", () => {
    const repo = new Repo(openDb(":memory:"));
    const c = repo.createConversation();
    repo.addMessage(c.id, "user", [{ type: "text", text: "hi" }]);
    repo.addMessages(c.id, [
      { role: "assistant", content: [{ type: "text", text: "yo" }], usage: { output_tokens: 1 } },
    ]);
    const msgs = repo.getMessages(c.id);
    expect(msgs.map((m) => [m.seq, m.role])).toEqual([[0, "user"], [1, "assistant"]]);
    expect(msgs[1]!.usage).toEqual({ output_tokens: 1 });
  });

  it("renames and cascades deletes", () => {
    const repo = new Repo(openDb(":memory:"));
    const c = repo.createConversation();
    repo.addMessage(c.id, "user", "x");
    expect(repo.renameConversation(c.id, "T")).toBe(true);
    expect(repo.getConversation(c.id)!.title).toBe("T");
    expect(repo.deleteConversation(c.id)).toBe(true);
    expect(repo.getMessages(c.id)).toEqual([]);
    expect(repo.deleteConversation(c.id)).toBe(false);
  });
});
