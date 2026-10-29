import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { ICON_NAMES, hasIcon } from "@clipai/blocks";
import type { JsonSchema } from "../blocks";
import { useStore } from "../store";
import { api } from "../api";

type Props = { schema: JsonSchema; value: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void };

const LONG_TEXT = /^(text|quote|subtitle)$/;

/** Auto-generated props form from a block's JSON Schema. */
export function SchemaForm({ schema, value, onChange }: Props) {
  const required = new Set(schema.required ?? []);
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(schema.properties ?? {}).map(([key, field]) => (
        <Field key={key} name={key} label={humanize(key)} required={required.has(key)} schema={field} value={value[key]} onChange={(v) => onChange({ [key]: v })} />
      ))}
    </div>
  );
}

const humanize = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted" title={hint}>
        {label}
      </span>
      {children}
    </label>
  );
}

/** Text input that commits after a pause or on blur, so typing doesn't flood history. */
export function DebouncedInput({
  value,
  onCommit,
  multiline,
  ...rest
}: { value: string; onCommit: (v: string) => void; multiline?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(value);
  useEffect(() => {
    if (value !== latest.current) {
      latest.current = value;
      setLocal(value);
    }
  }, [value]);
  const commit = (v: string) => {
    clearTimeout(timer.current);
    if (v !== latest.current) {
      latest.current = v;
      onCommit(v);
    }
  };
  const change = (v: string) => {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 400);
  };
  if (multiline) return <textarea rows={3} value={local} onChange={(e) => change(e.target.value)} onBlur={(e) => commit(e.target.value)} />;
  return <input {...rest} value={local} onChange={(e) => change(e.target.value)} onBlur={(e) => commit(e.target.value)} />;
}

function NumberInput({ value, onCommit, min, max, step }: { value: number | undefined; onCommit: (v: number | null) => void; min?: number; max?: number; step?: number }) {
  return (
    <DebouncedInput
      type="number"
      value={value === undefined ? "" : String(value)}
      min={min}
      max={max}
      step={step ?? "any"}
      onCommit={(v) => onCommit(v === "" ? null : Number(v))}
    />
  );
}

function Field({ name, label, required, schema, value, onChange }: { name: string; label: string; required?: boolean; schema: JsonSchema; value: unknown; onChange: (v: unknown) => void }) {
  const s = schema.anyOf?.find((x) => x.type !== "null") ?? schema;
  const effective = value ?? s.default;
  const hint = s.description;
  const title = `${label}${required ? " *" : ""}`;

  if (s.format === "color") {
    const v = typeof value === "string" ? value : "";
    return (
      <Row label={title} hint={hint}>
        <div className="flex gap-2">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#7c3aed"} onChange={(e) => onChange(e.target.value)} />
          <DebouncedInput value={v} placeholder="theme default" onCommit={(x) => onChange(x || null)} />
        </div>
      </Row>
    );
  }
  if (s.format === "asset") return <AssetField title={title} hint={hint} value={(value as string) ?? ""} onChange={onChange} accept="image" />;
  if (s.format === "icon") {
    const v = String(effective ?? "");
    return (
      <Row label={title} hint={hint}>
        <DebouncedInput value={v} list="lucide-icons" onCommit={(x) => onChange(x)} />
        {v && !hasIcon(v) && <span className="text-xs text-danger">Unknown icon, “sparkles” will be used</span>}
      </Row>
    );
  }
  if (s.enum) {
    return (
      <Row label={title} hint={hint}>
        <select value={String(effective ?? "")} onChange={(e) => onChange(e.target.value)}>
          {s.enum.map((o) => (
            <option key={String(o)} value={String(o)}>
              {String(o)}
            </option>
          ))}
        </select>
      </Row>
    );
  }
  if (s.type === "boolean") {
    return (
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!!effective} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-xs font-medium text-muted">{title}</span>
      </label>
    );
  }
  if (s.type === "number" || s.type === "integer") {
    return (
      <Row label={title} hint={hint}>
        <NumberInput value={effective as number | undefined} min={s.minimum} max={s.maximum} step={s.type === "integer" ? 1 : undefined} onCommit={(v) => onChange(v)} />
      </Row>
    );
  }
  if (s.type === "string") {
    return (
      <Row label={title} hint={hint}>
        <DebouncedInput value={String(effective ?? "")} multiline={LONG_TEXT.test(name)} onCommit={(v) => onChange(v)} />
      </Row>
    );
  }
  if (s.type === "array" && s.items) return <ListField title={title} hint={hint} schema={s} value={(effective as unknown[]) ?? []} onChange={onChange} />;
  if (s.type === "object" && s.properties) {
    const obj = (effective as Record<string, unknown>) ?? {};
    return (
      <fieldset className="rounded-md border border-line p-2">
        <legend className="px-1 text-xs font-medium text-muted">{title}</legend>
        <SchemaForm schema={s} value={obj} onChange={(patch) => onChange({ ...obj, ...patch })} />
      </fieldset>
    );
  }
  return (
    <Row label={`${title} (JSON)`} hint={hint}>
      <DebouncedInput
        value={JSON.stringify(effective ?? null)}
        onCommit={(v) => {
          try {
            onChange(JSON.parse(v));
          } catch {
            // ignore until valid
          }
        }}
      />
    </Row>
  );
}

function emptyItem(schema: JsonSchema): unknown {
  if (schema.type === "string") return "";
  if (schema.type === "number" || schema.type === "integer") return schema.minimum ?? 0;
  if (schema.type === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, p] of Object.entries(schema.properties ?? {})) {
      out[k] = p.default !== undefined ? structuredClone(p.default) : (schema.required ?? []).includes(k) ? emptyItem(p) : undefined;
      if (out[k] === undefined) delete out[k];
    }
    return out;
  }
  return null;
}

function ListField({ title, hint, schema, value, onChange }: { title: string; hint?: string; schema: JsonSchema; value: unknown[]; onChange: (v: unknown) => void }) {
  const items = schema.items!;
  const set = (i: number, v: unknown) => onChange(value.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  const canAdd = schema.maxItems === undefined || value.length < schema.maxItems;
  const canRemove = schema.minItems === undefined || value.length > schema.minItems;
  return (
    <fieldset className="rounded-md border border-line p-2">
      <legend className="px-1 text-xs font-medium text-muted" title={hint}>
        {title} ({value.length})
      </legend>
      <div className="flex flex-col gap-2">
        {value.map((item, i) => (
          <div key={i} className="flex gap-1 rounded-md bg-panel-2/50 p-1">
            <div className="min-w-0 flex-1">
              {items.type === "object" ? (
                <SchemaForm schema={items} value={(item as Record<string, unknown>) ?? {}} onChange={(patch) => set(i, { ...(item as object), ...patch })} />
              ) : (
                <Field name="item" label={`#${i + 1}`} schema={items} value={item} onChange={(v) => set(i, v)} />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <button className="btn btn-icon" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                <ArrowUp size={11} />
              </button>
              <button className="btn btn-icon" disabled={i === value.length - 1} onClick={() => move(i, 1)} title="Move down">
                <ArrowDown size={11} />
              </button>
              <button className="btn btn-icon" disabled={!canRemove} onClick={() => onChange(value.filter((_, j) => j !== i))} title="Remove">
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        <button className="btn self-start" disabled={!canAdd} onClick={() => onChange([...value, emptyItem(items)])}>
          <Plus size={12} /> Add
        </button>
      </div>
    </fieldset>
  );
}

/** Pick an asset of a type, or upload a new one. */
export function AssetField({ title, hint, value, onChange, accept }: { title: string; hint?: string; value: string; onChange: (v: string | null) => void; accept: "image" | "audio" }) {
  const { project, name, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const options = project?.assets.filter((a) => a.type === accept) ?? [];
  return (
    <Row label={title} hint={hint}>
      <div className="flex gap-1">
        <select value={value} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— none —</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} ({a.file})
            </option>
          ))}
        </select>
        <button className="btn btn-icon" type="button" onClick={() => fileRef.current?.click()} title="Upload">
          <Upload size={12} />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={accept === "image" ? "image/*" : "audio/*"}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !name) return;
            try {
              const res = await api.uploadAsset(name, file);
              const fresh = await api.getProject(name);
              useStore.setState({ project: fresh.project, history: fresh.history });
              onChange(res.id);
            } catch (err) {
              toast((err as Error).message, "error");
            }
            e.target.value = "";
          }}
        />
      </div>
    </Row>
  );
}

export function IconDatalist() {
  return (
    <datalist id="lucide-icons">
      {ICON_NAMES.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}
