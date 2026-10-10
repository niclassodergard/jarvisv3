import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().default(8080),
  DB_PATH: z.string().default("./data/jarvis.db"),
  JARVIS_MODEL: z.string().default("claude-sonnet-5-5"),
  JARVIS_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  TZ: z.string().default("Europe/Stockholm"),
  WEB_DIR: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${msg}`);
  }
  return parsed.data;
}
