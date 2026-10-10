import type { Tool } from "./types.ts";

export const getCurrentTime: Tool = {
  name: "get_current_time",
  description: "Get the current date and time in the user's timezone.",
  inputSchema: { type: "object", properties: {} },
  async run(_input, ctx) {
    return new Date().toLocaleString("en-GB", { timeZone: ctx.timezone, dateStyle: "full", timeStyle: "long" });
  },
};
