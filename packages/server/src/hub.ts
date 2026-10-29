import type { IncomingMessage, Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { isLocalRequest } from "./security.js";

type Client = { ws: WebSocket; project?: string };
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

/** WebSocket hub: pushes project changes to open editors and relays snapshot/export requests. */
export class Hub {
  private clients = new Set<Client>();
  private pending = new Map<string, Pending>();
  private wss: WebSocketServer;

  constructor(server: Server, port: () => number) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      verifyClient: ({ req }: { req: IncomingMessage }) => isLocalRequest(req.headers.host, req.headers.origin, port()),
    });
    this.wss.on("connection", (ws) => {
      const client: Client = { ws };
      this.clients.add(client);
      ws.on("close", () => this.clients.delete(client));
      ws.on("message", (data) => {
        let msg: any;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg.type === "editor:open") client.project = typeof msg.name === "string" ? msg.name : undefined;
        if ((msg.type === "snapshot:response" || msg.type === "export:response") && typeof msg.id === "string") {
          this.settle(msg.id, msg.error ? new Error(String(msg.error)) : null, msg);
        }
      });
    });
  }

  get editorCount() {
    return this.clients.size;
  }

  broadcast(msg: Record<string, unknown>): void {
    const data = JSON.stringify(msg);
    for (const c of this.clients) if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }

  /** Ask an open editor to do something and wait for its reply. Prefers editors showing `project`. */
  request<T>(type: string, project: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const open = [...this.clients].filter((c) => c.ws.readyState === c.ws.OPEN);
    const target = open.find((c) => c.project === project) ?? open[0];
    if (!target) return Promise.reject(new Error("No editor open. Open the Clipai URL in Chrome or Edge, then retry."));
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.settle(id, new Error(`${type} timed out`)), timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      target.ws.send(JSON.stringify({ type, id, name: project, ...payload }));
    });
  }

  /** Resolve a pending request (also used when the export upload arrives over HTTP). */
  settle(id: string, error: Error | null, value?: unknown): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (error) p.reject(error);
    else p.resolve(value);
    return true;
  }

  close() {
    for (const c of this.clients) c.ws.terminate();
    this.wss.close();
  }
}
