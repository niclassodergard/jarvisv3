import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";

export type ContentBlocks = Anthropic.MessageParam["content"];

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  seq: number;
  role: "user" | "assistant";
  content: ContentBlocks;
  usage: unknown;
  created_at: number;
}

const MIGRATIONS = [
  `CREATE TABLE conversations (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL DEFAULT 'New chat',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE messages (
     id TEXT PRIMARY KEY,
     conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     seq INTEGER NOT NULL,
     role TEXT NOT NULL,
     content_json TEXT NOT NULL,
     usage_json TEXT,
     created_at INTEGER NOT NULL,
     UNIQUE (conversation_id, seq)
   );`,
];

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

export class Repo {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }

  createConversation(title = "New chat"): Conversation {
    const now = Date.now();
    const c: Conversation = { id: randomUUID(), title, created_at: now, updated_at: now };
    this.db
      .prepare("INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(c.id, c.title, c.created_at, c.updated_at);
    return c;
  }

  listConversations(): Conversation[] {
    return this.db
      .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
      .all() as unknown as Conversation[];
  }

  getConversation(id: string): Conversation | undefined {
    return this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as unknown as
      | Conversation
      | undefined;
  }

  renameConversation(id: string, title: string): boolean {
    const r = this.db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, id);
    return Number(r.changes) > 0;
  }

  deleteConversation(id: string): boolean {
    const r = this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
    return Number(r.changes) > 0;
  }

  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: ContentBlocks,
    usage?: unknown,
  ): StoredMessage {
    const now = Date.now();
    const id = randomUUID();
    const next = this.db
      .prepare("SELECT COALESCE(MAX(seq), -1) + 1 AS n FROM messages WHERE conversation_id = ?")
      .get(conversationId) as { n: number };
    this.db
      .prepare(
        "INSERT INTO messages (id, conversation_id, seq, role, content_json, usage_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        conversationId,
        next.n,
        role,
        JSON.stringify(content),
        usage === undefined ? null : JSON.stringify(usage),
        now,
      );
    this.db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, conversationId);
    return { id, conversation_id: conversationId, seq: next.n, role, content, usage, created_at: now };
  }

  /** Persist several messages atomically (e.g. assistant tool_use + user tool_result). */
  addMessages(
    conversationId: string,
    msgs: { role: "user" | "assistant"; content: ContentBlocks; usage?: unknown }[],
  ): void {
    this.db.exec("BEGIN");
    try {
      for (const m of msgs) this.addMessage(conversationId, m.role, m.content, m.usage);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  countMessages(conversationId: string): number {
    const r = this.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?").get(conversationId) as {
      n: number;
    };
    return r.n;
  }

  getMessages(conversationId: string): StoredMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq")
      .all(conversationId) as unknown as {
      id: string;
      conversation_id: string;
      seq: number;
      role: "user" | "assistant";
      content_json: string;
      usage_json: string | null;
      created_at: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      seq: r.seq,
      role: r.role,
      content: JSON.parse(r.content_json) as ContentBlocks,
      usage: r.usage_json ? JSON.parse(r.usage_json) : undefined,
      created_at: r.created_at,
    }));
  }
}
