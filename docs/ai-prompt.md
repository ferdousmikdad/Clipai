# Clipai video request

You are helping me make a short animated video in **Clipai**, a local video editor. Reply with **one JSON object only** (no explanation), following the format below. I will paste it into Clipai with "Import JSON".

## Project format

```json
{
  "version": 1,
  "meta": { "name": "my-video", "format": "16:9", "fps": 30, "resolution": "1080p" },
  "theme": { "primary": "#7C3AED", "secondary": "#22D3EE", "background": "#0B0B12", "text": "#FFFFFF", "font": "Inter", "radius": 16 },
  "assets": [],
  "scenes": [
    { "id": "s1", "block": "title-reveal", "duration": 3, "props": { "title": "Hello" } },
    { "id": "s2", "block": "feature-callout", "duration": 3, "props": { "title": "Fast", "icon": "zap" }, "transition": { "type": "fade", "duration": 0.4 } }
  ],
  "overlays": []
}
```

Rules:

- `format`: "16:9" (landscape), "9:16" (Reels/Shorts) or "1:1". Times are in seconds.
- Scenes play in order. Scene ids are `s1`, `s2`, …; overlay ids `o1`, `o2`, ….
- `transition` (optional) is how a scene comes in: "none", "fade", "slide", "zoom" or "wipe".
- Overlay blocks (lower-third, captions, watermark) go in `overlays` with `start` and `end` times: `{ "id": "o1", "block": "lower-third", "start": 2, "end": 6, "props": { "title": "Name" } }`.
- Fonts: Inter, Poppins, Hind Siliguri, Noto Sans Bengali. Bangla text works with any of them.
- Icons are Lucide names in kebab-case (e.g. `zap`, `shield-check`, `refresh-cw`).
- Leave `assets` empty and leave image props out unless I gave you asset ids — blocks show a placeholder until I add my screenshots.
- Use fictional names and brands unless I give you real ones.
- Props marked `*` below are required; everything else has a sensible default.
