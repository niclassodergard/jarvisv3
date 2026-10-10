import type { Tool } from "./types.ts";
import { getCurrentTime } from "./time.ts";

// To add an integration: create a file exporting a Tool and list it here.
export const tools: Tool[] = [getCurrentTime];
