import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";

const base = readFileSync(new URL("../../prompts/system.md", import.meta.url), "utf8").trim();

export function buildSystem(timezone: string, now = new Date()): Anthropic.TextBlockParam[] {
  const stamp = now.toLocaleString("en-GB", { timeZone: timezone, dateStyle: "full" });
  return [
    { type: "text", text: base },
    { type: "text", text: `Today is ${stamp} (${timezone}). Use the get_current_time tool if you need the exact time.` },
  ];
}
