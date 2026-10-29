import type { z } from "zod";

type PathPart = PropertyKey;

/** Turn Zod issues into short messages like `s3.props.title: required`. */
export function formatIssues(
  issues: readonly z.core.$ZodIssue[],
  prefix = "",
  input?: unknown,
): string[] {
  return issues.map((issue) => {
    const path = friendlyPath(issue.path, input);
    const where = [prefix, path].filter(Boolean).join(".");
    return where ? `${where}: ${shortMessage(issue)}` : shortMessage(issue);
  });
}

function shortMessage(issue: z.core.$ZodIssue): string {
  const msg = issue.message ?? "invalid";
  if (issue.code === "invalid_type" && /received undefined/.test(msg)) return "required";
  if (issue.code === "invalid_value" && "values" in issue) {
    return `must be one of ${(issue.values as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`;
  }
  if (issue.code === "unrecognized_keys" && "keys" in issue) {
    return `unknown key(s) ${(issue.keys as string[]).join(", ")}`;
  }
  return msg.replace(/^Invalid input: /, "").replace(/^Invalid /, "invalid ");
}

/** Replace `scenes.2` / `overlays.0` with the scene/overlay id when available. */
function friendlyPath(path: readonly PathPart[], input: unknown): string {
  const parts = [...path];
  const root = input as { scenes?: { id?: unknown }[]; overlays?: { id?: unknown }[] } | undefined;
  if ((parts[0] === "scenes" || parts[0] === "overlays") && typeof parts[1] === "number") {
    const list = parts[0] === "scenes" ? root?.scenes : root?.overlays;
    const id = list?.[parts[1] as number]?.id;
    if (typeof id === "string" && id) {
      parts.splice(0, 2, id);
    }
  }
  return parts.map(String).join(".");
}
