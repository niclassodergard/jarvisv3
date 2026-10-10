import type { Conversation } from "../api";

export function Sidebar(props: {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}) {
  return (
    <aside className={`sidebar ${props.open ? "open" : ""}`}>
      <button className="new" onClick={props.onNew}>
        + New chat
      </button>
      <ul>
        {props.conversations.map((c) => (
          <li key={c.id} className={c.id === props.activeId ? "active" : ""}>
            <button className="title" onClick={() => props.onSelect(c.id)}>
              {c.title}
            </button>
            <button className="icon" title="Rename" onClick={() => props.onRename(c)}>
              ✎
            </button>
            <button className="icon" title="Delete" onClick={() => props.onDelete(c)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
