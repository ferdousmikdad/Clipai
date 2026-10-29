const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

/**
 * DNS-rebinding / CSRF guard: the Host must be localhost on our port and any Origin must be a
 * localhost page (any port, so the Vite dev server works).
 */
export function isLocalRequest(host: string | undefined, origin: string | undefined, port: number): boolean {
  if (!host) return false;
  const h = hostOf(host);
  if (!h || !LOCAL_HOSTS.has(h)) return false;
  const hostPort = host.split(":").pop();
  if (String(port) !== hostPort && host.includes(":")) return false;
  if (origin && origin !== "null") {
    const o = hostOf(origin);
    if (!o || !LOCAL_HOSTS.has(o)) return false;
  }
  return true;
}
