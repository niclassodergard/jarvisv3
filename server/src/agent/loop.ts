import type Anthropic from "@anthropic-ai/sdk";
import type { Repo } from "../db.ts";
import type { Tool } from "../tools/types.ts";

export type AgentEvent =
  | { type: "delta"; text: string }
  | { type: "thinking"; active: boolean }
  | { type: "tool"; name: string; status: "running" | "done" | "error" }
  | { type: "done"; usage: unknown };

export interface StreamLike {
  on(event: "text", cb: (delta: string) => void): unknown;
  on(event: "streamEvent", cb: (e: Anthropic.RawMessageStreamEvent) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
}

export interface ClientLike {
  messages: {
    stream(body: Anthropic.MessageStreamParams, opts?: { signal?: AbortSignal }): StreamLike;
  };
}

export interface AgentDeps {
  client: ClientLike;
  repo: Repo;
  tools: Tool[];
  model: string;
  effort: "low" | "medium" | "high";
  system: Anthropic.TextBlockParam[];
  timezone: string;
  maxTokens?: number;
  maxIterations?: number;
}

/**
 * Runs the assistant turn(s) for a conversation whose latest user message is already stored.
 * Persists assistant (and tool_result) messages as they complete; on abort, persists any partial text.
 */
export async function runAgent(
  deps: AgentDeps,
  conversationId: string,
  emit: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const { client, repo, tools } = deps;
  const maxIterations = deps.maxIterations ?? 10;
  const toolDefs: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
  const history: Anthropic.MessageParam[] = repo
    .getMessages(conversationId)
    .map((m) => ({ role: m.role, content: m.content }));

  const totals = { input_tokens: 0, output_tokens: 0 };

  for (let i = 0; i < maxIterations; i++) {
    let partial = "";
    const stream = client.messages.stream(
      {
        model: deps.model,
        max_tokens: deps.maxTokens ?? 16000,
        system: deps.system,
        cache_control: { type: "ephemeral" },
        messages: history,
        ...(toolDefs.length ? { tools: toolDefs } : {}),
        output_config: { effort: deps.effort },
      },
      { signal },
    );
    stream.on("text", (d) => {
      partial += d;
      emit({ type: "delta", text: d });
    });
    let thinking = false;
    stream.on("streamEvent", (e) => {
      if (e.type === "content_block_start" && e.content_block.type === "thinking") {
        thinking = true;
        emit({ type: "thinking", active: true });
      } else if (e.type === "content_block_stop" && thinking) {
        thinking = false;
        emit({ type: "thinking", active: false });
      }
    });

    let msg: Anthropic.Message;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      // Keep whatever the user already saw, on abort or failure alike.
      if (partial.trim()) repo.addMessage(conversationId, "assistant", [{ type: "text", text: partial }]);
      if (signal.aborted) return;
      throw err;
    }
    totals.input_tokens += msg.usage.input_tokens;
    totals.output_tokens += msg.usage.output_tokens;

    if (msg.stop_reason !== "tool_use") {
      // A cut-off reply (max_tokens) may end in a tool_use with no result, which the API rejects
      // on every later request; an empty reply is rejected too. Keep only blocks that are safe to replay.
      const safe = msg.content.filter((b) => b.type !== "tool_use");
      if (safe.length) repo.addMessage(conversationId, "assistant", safe, msg.usage);
      emit({ type: "done", usage: totals });
      return;
    }

    // Run tools; assistant tool_use turn and its results are persisted together.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      if (signal.aborted) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: "Cancelled", is_error: true });
        continue;
      }
      emit({ type: "tool", name: block.name, status: "running" });
      const tool = tools.find((t) => t.name === block.name);
      try {
        if (!tool) throw new Error(`Unknown tool: ${block.name}`);
        const out = await tool.run(block.input, { timezone: deps.timezone, signal });
        results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        emit({ type: "tool", name: block.name, status: "done" });
      } catch (err) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        });
        emit({ type: "tool", name: block.name, status: "error" });
      }
    }
    repo.addMessages(conversationId, [
      { role: "assistant", content: msg.content, usage: msg.usage },
      { role: "user", content: results },
    ]);
    if (signal.aborted) return;
    history.push({ role: "assistant", content: msg.content }, { role: "user", content: results });
  }
  throw new Error(`Stopped after ${maxIterations} tool iterations`);
}
