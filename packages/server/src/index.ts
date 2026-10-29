import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { Hub } from "./hub.js";
import { findRoot } from "./paths.js";

export { createApp } from "./app.js";
export { ProjectStore, StoreError } from "./store.js";
export { isLocalRequest } from "./security.js";
export { findRoot } from "./paths.js";

export type StartOptions = { port?: number; root?: string; projectsDir?: string; host?: string };

/** Start the local server on 127.0.0.1. */
export async function startServer(options: StartOptions = {}) {
  const root = options.root ?? findRoot();
  let port = options.port ?? 4400;
  const ref: { hub?: Hub } = {};
  const { app, store, registry, plugins } = await createApp({ root, projectsDir: options.projectsDir, port: () => port, hub: () => ref.hub });
  const server = await new Promise<Server>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, port, hostname: options.host ?? "127.0.0.1" }, () => resolve(s as Server)) as Server;
    s.once("error", reject);
  });
  port = (server.address() as AddressInfo).port;
  const hub = new Hub(server, () => port);
  ref.hub = hub;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    root,
    projectsDir: store.dir,
    store,
    registry,
    plugins,
    hub,
    close: () =>
      new Promise<void>((resolve) => {
        hub.close();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
