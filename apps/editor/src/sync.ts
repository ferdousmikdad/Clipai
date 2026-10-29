import { dimensions, type Project } from "@clipai/schema";
import { loadFonts, renderFrame } from "@clipai/engine";
import { useStore } from "./store";
import { registry } from "./blocks";
import { getAssets } from "./assets";

import { useExport } from "./exporter";

let ws: WebSocket | null = null;

/** Keep a WebSocket to the local server for live updates and MCP requests (snapshot/export). */
export function connectSync(): void {
  if (ws) return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => sendOpen(useStore.getState().name);
  sock.onclose = () => {
    ws = null;
    setTimeout(connectSync, 1000);
  };
  sock.onmessage = (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const store = useStore.getState();
    if (msg.type === "project:updated") store.receive(msg.name, msg.project, msg.history, msg.source, msg.changed ?? []);
    if (msg.type === "project:deleted" && store.name === msg.name) {
      store.close();
      store.toast(`Project "${msg.name}" was deleted.`);
    }
    if (msg.type === "snapshot:request") void handleSnapshot(msg);
    if (msg.type === "export:request") void handleExport(msg);
  };
}

export function sendOpen(name: string | null) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "editor:open", name }));
}

function reply(msg: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

async function projectFor(name: string): Promise<Project> {
  const s = useStore.getState();
  if (s.name === name && s.project) return s.project;
  await s.open(name);
  return useStore.getState().project!;
}

async function handleSnapshot(msg: { id: string; name: string; time: number; width?: number }) {
  try {
    const project = await projectFor(msg.name);
    await loadFonts();
    const assets = await getAssets(msg.name, project);
    const full = dimensions(project.meta.format, "1080p");
    const width = Math.min(full.width, Math.max(160, Math.round(msg.width ?? 640)));
    const height = Math.round((full.height / full.width) * width);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    renderFrame(ctx, project, msg.time, assets, registry);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    reply({ type: "snapshot:response", id: msg.id, png: btoa(bin) });
  } catch (e) {
    reply({ type: "snapshot:response", id: msg.id, error: (e as Error).message });
  }
}

async function handleExport(msg: { id: string; name: string; options?: { resolution?: string; fps?: number; quality?: string } }) {
  try {
    const project = await projectFor(msg.name);
    const o = msg.options ?? {};
    await useExport.getState().start(
      msg.name,
      project,
      {
        resolution: o.resolution === "720p" || o.resolution === "1080p" ? o.resolution : project.meta.resolution,
        fps: o.fps === 60 || o.fps === 30 ? o.fps : project.meta.fps,
        quality: o.quality === "high" ? "high" : "standard",
      },
      msg.id,
    );
  } catch (e) {
    reply({ type: "export:response", id: msg.id, error: (e as Error).message });
  }
}

