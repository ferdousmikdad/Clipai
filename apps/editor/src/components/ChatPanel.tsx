import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, MessageSquarePlus, Send, Settings, Sparkles, Square, X } from "lucide-react";
import { useStore } from "../store";
import { useChat, type ChatMessage } from "../chat";
import { Modal } from "./Modal";

const STEP_LABELS: Record<string, string> = {
  list_blocks: "Looked at the blocks",
  get_block: "Read block details",
  get_summary: "Checked the project",
  get_project: "Read the project",
  set_project: "Built the video",
  apply_ops: "Edited the project",
  add_asset: "Added a file",
  snapshot: "Looked at a frame",
};

const NO_MESSAGES: ChatMessage[] = [];

const SUGGESTIONS = [
  "Make a 20-second promo for my app with 4 scenes",
  "Change the theme to warm orange",
  "Add captions for the first two scenes",
  "Make every scene a bit shorter",
];

/** Render **bold** and line breaks; everything else is plain text. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i} className={line.trim() ? "" : "h-2"}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") && part.endsWith("**") ? <b key={j}>{part.slice(2, -2)}</b> : part))}
        </p>
      ))}
    </>
  );
}

function Message({ m, live }: { m: ChatMessage; live: boolean }) {
  if (m.role === "user") {
    return <div className="ml-8 self-end whitespace-pre-wrap rounded-lg bg-accent px-3 py-2 text-accent-fg">{m.text}</div>;
  }
  return (
    <div className="mr-4 flex flex-col gap-1.5">
      {m.steps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {m.steps.map((s) => (
            <span
              key={s.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${s.ok === false ? "border-danger text-danger" : "border-line text-muted"}`}
              title={s.text}
            >
              {s.ok === undefined ? <Loader2 size={10} className="animate-spin" /> : s.ok ? <Check size={10} /> : <X size={10} />}
              {STEP_LABELS[s.name] ?? s.name}
            </span>
          ))}
        </div>
      )}
      {m.text && (
        <div className="leading-relaxed">
          <RichText text={m.text} />
        </div>
      )}
      {live && !m.text && !m.error && (
        <span className="flex items-center gap-1.5 text-muted">
          <Loader2 size={12} className="animate-spin" /> Thinking…
        </span>
      )}
      {m.error && <div className="rounded-md border border-danger px-2 py-1 text-xs text-danger">{m.error}</div>}
    </div>
  );
}

export function ChatPanel() {
  const name = useStore((s) => s.name);
  const { status, threads, running, loadStatus, send, stop, reset } = useChat();
  const [input, setInput] = useState("");
  const [settings, setSettings] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const thread = (name && threads[name]) || NO_MESSAGES;
  const busy = running === name;

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [thread]);

  if (!name) return null;
  if (!status) return <p className="p-3 text-muted">Loading…</p>;

  const submit = (text = input) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void send(name, t);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5 text-xs text-muted">
        <Sparkles size={12} className="text-accent" />
        <span className="flex-1 truncate">
          {status.backend === "claude-code" ? "Claude via Claude Code" : status.backend === "api" ? `Claude via API key · ${status.model}` : "Not connected"}
        </span>
        <button className="btn btn-icon" title="New chat" onClick={() => reset(name)} disabled={thread.length === 0}>
          <MessageSquarePlus size={12} />
        </button>
        <button className="btn btn-icon" title="Chat settings" onClick={() => setSettings(true)}>
          <Settings size={12} />
        </button>
      </div>

      {!status.backend ? (
        <div className="flex-1 overflow-auto p-3">
          <ConnectCard onOpenSettings={() => setSettings(true)} />
        </div>
      ) : (
        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-auto p-3">
          {thread.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted">Tell Claude what video you want. Changes appear in the preview as it works.</p>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn justify-start whitespace-normal text-left" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          ) : (
            thread.map((m, i) => <Message key={i} m={m} live={busy && i === thread.length - 1} />)
          )}
        </div>
      )}

      <div className="border-t border-line p-2">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            disabled={!status.backend}
            placeholder={status.backend ? "Ask Claude to build or change your video…" : "Connect Claude to start chatting"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-40 min-h-[52px] resize-y"
          />
          {busy ? (
            <button className="btn btn-icon" onClick={() => stop(name)} title="Stop">
              <Square size={14} />
            </button>
          ) : (
            <button className="btn btn-icon btn-primary" onClick={() => submit()} disabled={!input.trim() || !status.backend} title="Send (Enter)">
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-muted">Enter to send · Shift+Enter for a new line · Messages go to Anthropic.</p>
      </div>
      {settings && <ChatSettings onClose={() => setSettings(false)} />}
    </div>
  );
}

function ConnectCard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { loadStatus } = useChat();
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">Connect Claude</h3>
      <Option title="Use Claude Code (your Claude subscription)">
        <ol className="list-decimal pl-4 text-muted">
          <li>
            Install Claude Code from{" "}
            <a className="text-accent underline" href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
              claude.com/claude-code
            </a>
          </li>
          <li>
            Run <code>claude</code> once in a terminal and sign in
          </li>
        </ol>
        <button className="btn mt-2" onClick={() => loadStatus()}>
          Check again
        </button>
      </Option>
      <Option title="Or use an Anthropic API key (pay per use)">
        <button className="btn" onClick={onOpenSettings}>
          Add API key
        </button>
      </Option>
    </div>
  );
}

function Option({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="mb-1 font-medium">{title}</div>
      {children}
    </div>
  );
}

function ChatSettings({ onClose }: { onClose: () => void }) {
  const { status, saveSettings } = useChat();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!status) return null;
  const save = async (patch: Parameters<typeof saveSettings>[0]) => {
    try {
      setError(null);
      await saveSettings(patch);
      setKey("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Chat settings" onClose={onClose} width={480}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Connect with</span>
          <select value={status.mode} onChange={(e) => save({ mode: e.target.value as typeof status.mode })}>
            <option value="auto">Automatic: Claude Code if installed, else API key</option>
            <option value="claude-code">Claude Code (your Claude login)</option>
            <option value="api">Anthropic API key</option>
          </select>
        </label>
        <div className="rounded-md border border-line p-3">
          <div className="font-medium">Claude Code</div>
          <p className="text-muted">
            {status.claudeCode.installed ? `Installed (${status.claudeCode.version}). Uses your Claude login and plan.` : "Not found. Install it from claude.com/claude-code, then run “claude” once to sign in."}
          </p>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="font-medium">Anthropic API key</div>
          <p className="mb-2 text-muted">
            {status.apiKey.set
              ? status.apiKey.source === "env"
                ? "Using ANTHROPIC_API_KEY from the environment."
                : "A key is saved on this computer (.clipai/settings.json)."
              : "Get a key at console.anthropic.com. It's stored only on this computer."}
          </p>
          <div className="flex gap-2">
            <input type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
            <button className="btn btn-primary" disabled={!key.trim()} onClick={() => save({ apiKey: key })}>
              Save
            </button>
          </div>
          {status.apiKey.set && status.apiKey.source === "settings" && (
            <button className="btn mt-2" onClick={() => save({ apiKey: null })}>
              Remove saved key
            </button>
          )}
        </div>
        {error && <p className="text-danger">{error}</p>}
        <p className="text-xs text-muted">
          Chat messages and your project summary are sent to Anthropic to generate replies. Everything else stays on your computer.
        </p>
      </div>
    </Modal>
  );
}
