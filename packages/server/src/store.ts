import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applyOps,
  createProject,
  projectDuration,
  validateProject,
  type BlockLookup,
  type Format,
  type Project,
  type Theme,
} from "@clipai/schema";
import { isValidName } from "./paths.js";

const HISTORY_FILES = 10;
const UNDO_LIMIT = 100;

export type ProjectListItem = { name: string; format: string; duration: number; scenes: number; updated: string };

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
    public errors: string[] = [],
  ) {
    super(message);
  }
}

/** Plain-file project store. `project.json` on disk is the single source of truth. */
export class ProjectStore {
  private cache = new Map<string, Project>();
  private undoStack = new Map<string, Project[]>();
  private redoStack = new Map<string, Project[]>();
  private queue = new Map<string, Promise<unknown>>();

  constructor(
    public readonly dir: string,
    private lookup: BlockLookup,
  ) {}

  projectDir(name: string): string {
    if (!isValidName(name)) throw new StoreError(`invalid project name "${name}" (use letters, digits, - and _)`);
    return path.join(this.dir, name);
  }

  private file(name: string) {
    return path.join(this.projectDir(name), "project.json");
  }

  /** Serialize writes per project so concurrent requests can't interleave. */
  private exclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queue.get(name) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.queue.set(name, next.catch(() => undefined));
    return next;
  }

  async list(): Promise<ProjectListItem[]> {
    await fs.mkdir(this.dir, { recursive: true });
    const entries = await fs.readdir(this.dir, { withFileTypes: true });
    const out: ProjectListItem[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || !isValidName(e.name)) continue;
      try {
        const p = await this.get(e.name);
        const stat = await fs.stat(this.file(e.name));
        out.push({ name: e.name, format: p.meta.format, duration: projectDuration(p), scenes: p.scenes.length, updated: stat.mtime.toISOString() });
      } catch {
        // not a project folder
      }
    }
    return out.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async exists(name: string): Promise<boolean> {
    try {
      await fs.access(this.file(name));
      return true;
    } catch {
      return false;
    }
  }

  async get(name: string): Promise<Project> {
    const hit = this.cache.get(name);
    if (hit) return hit;
    let raw: string;
    try {
      raw = await fs.readFile(this.file(name), "utf8");
    } catch {
      throw new StoreError(`project "${name}" not found`, 404);
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new StoreError(`project "${name}": project.json is not valid JSON`, 500);
    }
    // Load leniently (no block checks) so a project using a missing plugin still opens.
    const res = validateProject(json);
    if (!res.ok) throw new StoreError(`project "${name}" is invalid`, 500, res.errors);
    this.cache.set(name, res.project);
    return res.project;
  }

  async create(name: string, format: Format = "16:9", theme?: Partial<Theme>): Promise<Project> {
    return this.exclusive(name, async () => {
      if (await this.exists(name)) throw new StoreError(`project "${name}" already exists`, 409);
      const project = createProject(name, format, theme);
      const res = validateProject(project);
      if (!res.ok) throw new StoreError("invalid project", 400, res.errors);
      await fs.mkdir(path.join(this.projectDir(name), "assets"), { recursive: true });
      await fs.mkdir(path.join(this.projectDir(name), "exports"), { recursive: true });
      await this.write(name, res.project);
      return res.project;
    });
  }

  /** Replace the whole project (validated against block schemas). */
  async put(name: string, input: unknown): Promise<Project> {
    return this.exclusive(name, async () => {
      const current = await this.get(name);
      const candidate = { ...(input as object), meta: { ...(input as Project)?.meta, name } };
      const res = validateProject(candidate, this.lookup);
      if (!res.ok) throw new StoreError("validation failed", 400, res.errors);
      this.pushUndo(name, current);
      await this.write(name, res.project);
      return res.project;
    });
  }

  async apply(name: string, ops: unknown[]): Promise<{ project: Project; changed: string[] }> {
    return this.exclusive(name, async () => {
      const current = await this.get(name);
      const res = applyOps(current, ops, this.lookup);
      if (res.errors.length) throw new StoreError("ops failed", 400, res.errors);
      res.project.meta.name = name;
      this.pushUndo(name, current);
      await this.write(name, res.project);
      return { project: res.project, changed: res.changed };
    });
  }

  async undo(name: string): Promise<Project> {
    return this.step(name, this.undoStack, this.redoStack, "nothing to undo");
  }

  async redo(name: string): Promise<Project> {
    return this.step(name, this.redoStack, this.undoStack, "nothing to redo");
  }

  canUndo(name: string) {
    return { undo: (this.undoStack.get(name)?.length ?? 0) > 0, redo: (this.redoStack.get(name)?.length ?? 0) > 0 };
  }

  private async step(name: string, from: Map<string, Project[]>, to: Map<string, Project[]>, empty: string) {
    return this.exclusive(name, async () => {
      const stack = from.get(name) ?? [];
      const prev = stack.pop();
      if (!prev) throw new StoreError(empty, 409);
      const current = await this.get(name);
      const other = to.get(name) ?? [];
      other.push(current);
      to.set(name, other.slice(-UNDO_LIMIT));
      await this.write(name, prev);
      return prev;
    });
  }

  async remove(name: string): Promise<void> {
    return this.exclusive(name, async () => {
      if (!(await this.exists(name))) throw new StoreError(`project "${name}" not found`, 404);
      await fs.rm(this.projectDir(name), { recursive: true, force: true });
      this.cache.delete(name);
      this.undoStack.delete(name);
      this.redoStack.delete(name);
    });
  }

  async duplicate(name: string, to: string): Promise<Project> {
    const src = await this.get(name);
    if (await this.exists(to)) throw new StoreError(`project "${to}" already exists`, 409);
    await fs.cp(this.projectDir(name), this.projectDir(to), {
      recursive: true,
      filter: (p) => !p.includes(`${path.sep}.history`) && !p.includes(`${path.sep}exports${path.sep}`),
    });
    const copy = structuredClone(src);
    copy.meta.name = to;
    this.cache.delete(to);
    await fs.mkdir(path.join(this.projectDir(to), "exports"), { recursive: true });
    await this.write(to, copy);
    return copy;
  }

  private pushUndo(name: string, project: Project) {
    const stack = this.undoStack.get(name) ?? [];
    stack.push(project);
    this.undoStack.set(name, stack.slice(-UNDO_LIMIT));
    this.redoStack.set(name, []);
  }

  /** Atomic write (temp file → rename) plus a rolling backup in `.history/`. */
  private async write(name: string, project: Project): Promise<void> {
    const dir = this.projectDir(name);
    const file = this.file(name);
    await fs.mkdir(dir, { recursive: true });
    try {
      const old = await fs.readFile(file, "utf8");
      const hist = path.join(dir, ".history");
      await fs.mkdir(hist, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.writeFile(path.join(hist, `${stamp}.json`), old);
      const files = (await fs.readdir(hist)).filter((f) => f.endsWith(".json")).sort();
      for (const f of files.slice(0, Math.max(0, files.length - HISTORY_FILES))) await fs.rm(path.join(hist, f), { force: true });
    } catch {
      // first write
    }
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(project, null, 2) + "\n");
    await fs.rename(tmp, file);
    this.cache.set(name, project);
  }
}
