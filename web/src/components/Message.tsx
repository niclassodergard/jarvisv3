import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export interface DisplayMessage {
  key: string;
  role: "user" | "assistant";
  text: string;
  tools: { name: string; status: "running" | "done" | "error" }[];
  pending?: boolean;
}

export const Message = memo(function Message({ m }: { m: DisplayMessage }) {
  return (
    <div className={`msg ${m.role}`}>
      {m.tools.map((t, i) => (
        <div key={i} className={`chip ${t.status}`}>
          {t.status === "running" ? "Using" : "Used"} tool: {t.name}
        </div>
      ))}
      {m.role === "user" ? (
        <div className="bubble user-text">{m.text}</div>
      ) : m.text ? (
        <div className="bubble md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {m.text}
          </ReactMarkdown>
        </div>
      ) : m.pending ? (
        <div className="bubble thinking">thinking…</div>
      ) : null}
    </div>
  );
});
