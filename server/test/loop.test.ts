import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { openDb, Repo } from "../src/db.ts";
import { runAgent, type AgentEvent, type ClientLike } from "../src/agent/loop.ts";
import type { Tool } from "../src/tools/types.ts";

function msg(content: Anthropic.ContentBlock[], stop: Anthropic.Message["stop_reason"]): Anthropic.Message {
  return { id: "m", type: "message", role: "assistant", model: "x", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } as Anthropic.Message;
}

function fakeClient(replies: Anthropic.Message[]): ClientLike {
  let i = 0;
  return {
    messages: {
      stream() {
        const reply = replies[Math.min(i++, replies.length - 1)]!;
        const handlers: Record<string, (x: never) => void> = {};
        return {
          on(ev: string, cb: (x: never) => void) {
            handlers[ev] = cb;
          },
          async finalMessage() {
            for (const b of reply.content) if (b.type === "text") handlers["text"]?.(b.text as never);
            return reply;
          },
        } as never;
      },
    },
  };
}

const echo: Tool = {
  name: "echo",
  description: "",
  inputSchema: { type: "object", properties: {} },
  run: async () => "pong",
};
const boom: Tool = { ...echo, name: "boom", run: async () => { throw new Error("bad"); } };

function setup(replies: Anthropic.Message[], tools: Tool[], maxIterations?: number) {
  const repo = new Repo(openDb(":memory:"));
  const conv = repo.createConversation();
  repo.addMessage(conv.id, "user", [{ type: "text", text: "hi" }]);
  const events: AgentEvent[] = [];
  const run = () =>
    runAgent(
      { client: fakeClient(replies), repo, tools, model: "m", effort: "medium", system: [], timezone: "UTC", maxIterations },
      conv.id,
      (e) => events.push(e),
      new AbortController().signal,
    );
  return { repo, conv, events, run };
}

describe("runAgent", () => {
  it("plain text turn", async () => {
    const s = setup([msg([{ type: "text", text: "hello", citations: null } as never], "end_turn")], []);
    await s.run();
    expect(s.events.map((e) => e.type)).toEqual(["delta", "done"]);
    expect(s.repo.getMessages(s.conv.id)).toHaveLength(2);
  });

  it("tool_use -> tool_result -> final text", async () => {
    const s = setup(
      [
        msg([{ type: "tool_use", id: "t1", name: "echo", input: {} } as never], "tool_use"),
        msg([{ type: "text", text: "done", citations: null } as never], "end_turn"),
      ],
      [echo],
    );
    await s.run();
    const m = s.repo.getMessages(s.conv.id);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(JSON.stringify(m[2]!.content)).toContain("pong");
  });

  it("reports tool errors as is_error results", async () => {
    const s = setup(
      [
        msg([{ type: "tool_use", id: "t1", name: "boom", input: {} } as never], "tool_use"),
        msg([{ type: "text", text: "ok", citations: null } as never], "end_turn"),
      ],
      [boom],
    );
    await s.run();
    expect(JSON.stringify(s.repo.getMessages(s.conv.id)[2]!.content)).toContain('"is_error":true');
    expect(s.events).toContainEqual({ type: "tool", name: "boom", status: "error" });
  });

  it("caps tool iterations", async () => {
    const s = setup([msg([{ type: "tool_use", id: "t", name: "echo", input: {} } as never], "tool_use")], [echo], 3);
    await expect(s.run()).rejects.toThrow(/3 tool iterations/);
  });
});
