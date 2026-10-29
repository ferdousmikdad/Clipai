/** Thin HTTP client for the local Clipai server. */

export const NOT_RUNNING = 'Editor not running. Run "pnpm start" in the Clipai folder.';

export class ClipaiError extends Error {}

export class ClipaiClient {
  constructor(public readonly baseUrl: string) {}

  async request<T = any>(method: string, path: string, body?: unknown, timeoutMs = 60_000): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: { "content-type": "application/json", "x-clipai-source": "mcp" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      if (err.name === "TimeoutError") throw new ClipaiError("Timed out waiting for the editor.");
      throw new ClipaiError(NOT_RUNNING);
    }
    const text = await res.text();
    let data: any = text;
    if ((res.headers.get("content-type") ?? "").includes("json")) {
      try {
        data = JSON.parse(text);
      } catch {
        // keep text
      }
    }
    return { status: res.status, data };
  }

  /** Request that throws a short message on non-2xx. */
  async call<T = any>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const { status, data } = await this.request<any>(method, path, body, timeoutMs);
    if (status >= 400) {
      const errors: string[] = data?.errors?.length ? data.errors : [];
      const msg = data?.error ?? (typeof data === "string" ? data : `HTTP ${status}`);
      throw new ClipaiError(errors.length ? errors.slice(0, 20).join("\n") : msg);
    }
    return data as T;
  }
}

export function defaultBaseUrl(): string {
  if (process.env.CLIPAI_URL) return process.env.CLIPAI_URL.replace(/\/+$/, "");
  return `http://127.0.0.1:${process.env.CLIPAI_PORT ?? 4400}`;
}
