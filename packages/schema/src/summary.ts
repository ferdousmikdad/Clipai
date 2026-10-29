import type { Project, Scene } from "./project.js";
import { projectDuration, round } from "./timing.js";

const fmt = (n: number) => `${round(n, 2)}s`;

/** Compact, AI-friendly text description of a project. */
export function summary(project: Project): string {
  const { meta, theme } = project;
  const lines = [
    `${meta.name} · ${meta.format} ${meta.resolution}${meta.fps} · ${fmt(projectDuration(project))} · theme ${theme.primary}/${theme.font}`,
  ];
  for (const s of project.scenes) lines.push(sceneLine(s));
  for (const o of project.overlays) {
    lines.push(`${o.id} ${o.block} ${round(o.start, 2)}-${round(o.end, 2)}s${label(o.props)}`);
  }
  if (project.assets.length) lines.push(`assets: ${project.assets.map((a) => `${a.id}(${a.type})`).join(", ")}`);
  if (project.audio?.music) lines.push(`music: ${project.audio.music} (${project.audio.volume})`);
  return lines.join("\n");
}

function sceneLine(s: Scene): string {
  const parts = [s.id, s.block, fmt(s.duration)];
  const text = label(s.props);
  const asset = typeof s.props.asset === "string" ? ` asset=${s.props.asset}` : "";
  const tr = s.transition && s.transition.type !== "none" ? ` ${s.transition.type}` : "";
  return parts.join(" ") + text + asset + tr;
}

function label(props: Record<string, unknown>): string {
  for (const key of ["title", "text", "quote"]) {
    const v = props[key];
    if (typeof v === "string" && v) return ` "${v.length > 40 ? v.slice(0, 39) + "…" : v}"`;
  }
  const lines = props.lines;
  if (Array.isArray(lines) && typeof lines[0] === "string") return ` "${lines[0]}"…`;
  return "";
}
