import type Anthropic from "@anthropic-ai/sdk";

export interface ToolContext {
  timezone: string;
  signal: AbortSignal;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  run(input: unknown, ctx: ToolContext): Promise<string>;
}
