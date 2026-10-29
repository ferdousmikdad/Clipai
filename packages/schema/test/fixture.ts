import type { Project } from "@clipai/schema";

export const example: Project = {
  version: 1,
  meta: { name: "taskflow-promo", format: "16:9", fps: 30, resolution: "1080p" },
  theme: { primary: "#7C3AED", secondary: "#22D3EE", background: "#0B0B12", text: "#FFFFFF", font: "Inter", radius: 16 },
  assets: [
    { id: "dash", type: "image", file: "dashboard.png" },
    { id: "music", type: "audio", file: "music.mp3" },
  ],
  scenes: [
    { id: "s1", block: "title-reveal", duration: 3, props: { title: "Meet TaskFlow", subtitle: "Plan less. Ship more." } },
    { id: "s2", block: "ui-mockup", duration: 4, props: { asset: "dash", frame: "browser", motion: "slide-up" }, transition: { type: "fade", duration: 0.4 } },
    { id: "s3", block: "feature-callout", duration: 3, props: { title: "Auto-sync", text: "Every device, instantly.", icon: "refresh-cw" } },
    { id: "s4", block: "logo-outro", duration: 2.5, props: { text: "taskflow.app" } },
  ],
  overlays: [],
  audio: { music: "music.mp3", volume: 0.6, fadeOut: 1.5 },
};
