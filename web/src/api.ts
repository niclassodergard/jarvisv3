export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface Block {
  type: string;
  text?: string;
  name?: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string | Block[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const headers = { "content-type": "application/json" };

export const api = {
  list: () => fetch("/api/conversations").then(json<Conversation[]>),
  create: () => fetch("/api/conversations", { method: "POST" }).then(json<Conversation>),
  get: (id: string) =>
    fetch(`/api/conversations/${id}`).then(json<Conversation & { messages: StoredMessage[] }>),
  rename: (id: string, title: string) =>
    fetch(`/api/conversations/${id}`, { method: "PATCH", headers, body: JSON.stringify({ title }) }).then(json),
  remove: (id: string) => fetch(`/api/conversations/${id}`, { method: "DELETE" }).then(json),
};

export type ChatEvent =
  | { event: "delta"; data: { text: string } }
  | { event: "thinking"; data: { active: boolean } }
  | { event: "tool"; data: { name: string; status: "running" | "done" | "error" } }
  | { event: "title"; data: { title: string } }
  | { event: "done"; data: unknown }
  | { event: "error"; data: { message: string } };

/** POSTs a message and yields parsed SSE events until the stream ends. */
export async function* sendMessage(id: string, text: string, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await fetch(`/api/conversations/${id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `${res.status} ${res.statusText}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: JSON.parse(data.join("\n")) } as ChatEvent;
    }
  }
}
