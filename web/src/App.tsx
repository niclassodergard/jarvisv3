import { useCallback, useEffect, useRef, useState } from "react";
import { api, sendMessage, type Conversation, type StoredMessage } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Message, type DisplayMessage } from "./components/Message";
import { Composer } from "./components/Composer";

/** Flattens stored Anthropic messages into what the UI shows: user text, assistant text + tool chips. */
function toDisplay(msgs: StoredMessage[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  for (const m of msgs) {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (m.role === "user") {
      if (blocks.some((b) => b.type === "tool_result")) continue;
      out.push({ key: m.id, role: "user", text: blocks.map((b) => b.text ?? "").join(""), tools: [] });
      continue;
    }
    let cur = out[out.length - 1];
    if (!cur || cur.role !== "assistant") {
      cur = { key: m.id, role: "assistant", text: "", tools: [] };
      out.push(cur);
    }
    for (const b of blocks) {
      if (b.type === "text") cur.text += b.text ?? "";
      else if (b.type === "tool_use") cur.tools.push({ name: b.name ?? "tool", status: "done" });
    }
  }
  return out;
}

export function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  const refreshList = useCallback(() => api.list().then(setConversations).catch((e) => setError(String(e))), []);
  useEffect(() => void refreshList(), [refreshList]);
  useEffect(() => bottomRef.current?.scrollIntoView({ block: "end" }), [messages]);

  const select = async (id: string) => {
    abortRef.current?.abort();
    setSidebarOpen(false);
    setError(null);
    setActiveId(id);
    try {
      const c = await api.get(id);
      if (activeRef.current === id) setMessages(toDisplay(c.messages));
    } catch (e) {
      setError(String(e));
    }
  };

  const newChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  };

  const send = async (text: string) => {
    setError(null);
    let id = activeId;
    try {
      if (!id) {
        const c = await api.create();
        void refreshList();
        if (activeRef.current !== null) return; // user switched conversations while it was being created
        id = c.id;
        setActiveId(id);
        activeRef.current = id;
      }
    } catch (e) {
      setError(String(e));
      return;
    }
    const convId = id;
    const reply: DisplayMessage = { key: crypto.randomUUID(), role: "assistant", text: "", tools: [], pending: true };
    setMessages((m) => [...m, { key: crypto.randomUUID(), role: "user", text, tools: [] }, reply]);
    const update = (fn: (r: DisplayMessage) => DisplayMessage) =>
      setMessages((ms) => ms.map((m) => (m.key === reply.key ? fn(m) : m)));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    try {
      for await (const ev of sendMessage(convId, text, ctrl.signal)) {
        if (ev.event === "delta") update((r) => ({ ...r, text: r.text + ev.data.text }));
        else if (ev.event === "tool")
          update((r) => {
            const idx = r.tools.findIndex((t) => t.name === ev.data.name && t.status === "running");
            const tools =
              idx >= 0
                ? r.tools.map((t, i) => (i === idx ? { ...t, status: ev.data.status } : t))
                : [...r.tools, { name: ev.data.name, status: ev.data.status }];
            return { ...r, tools };
          });
        else if (ev.event === "done") setBusy(false);
        else if (ev.event === "title")
          setConversations((l) => l.map((c) => (c.id === convId ? { ...c, title: ev.data.title } : c)));
        else if (ev.event === "error") setError(ev.data.message);
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      update((r) => ({ ...r, pending: false }));
      if (abortRef.current === ctrl) setBusy(false);
      void refreshList();
    }
  };

  const rename = async (c: Conversation) => {
    const title = window.prompt("Rename conversation", c.title)?.trim();
    if (!title) return;
    await api.rename(c.id, title).catch((e) => setError(String(e)));
    void refreshList();
  };

  const remove = async (c: Conversation) => {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    await api.remove(c.id).catch((e) => setError(String(e)));
    if (c.id === activeId) newChat();
    void refreshList();
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onSelect={select}
        onNew={newChat}
        onRename={rename}
        onDelete={remove}
      />
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}
      <main>
        <header>
          <button className="menu" onClick={() => setSidebarOpen(true)} aria-label="Conversations">
            ☰
          </button>
          <span>Jarvis</span>
        </header>
        <div className="thread">
          {messages.length === 0 && <div className="empty">How can I help?</div>}
          {messages.map((m) => (
            <Message key={m.key} m={m} />
          ))}
          {error && <div className="error">{error}</div>}
          <div ref={bottomRef} />
        </div>
        <Composer busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} />
      </main>
    </div>
  );
}
