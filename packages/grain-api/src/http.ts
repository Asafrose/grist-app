import type { ZodType } from "zod";

export const GRAIN_API_BASE_URL = "https://api.grain.com";
export const GRAIN_API_VERSION = "2025-10-31";

export class GrainApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GrainApiError";
  }
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
  get isRateLimit() {
    return this.status === 429;
  }
}

export class GrainSchemaError extends Error {
  constructor(
    readonly path: string,
    readonly issues: unknown,
  ) {
    super(`Unexpected response shape from ${path}`);
    this.name = "GrainSchemaError";
  }
}

export type RateLimitInfo = { limit: number | null; remaining: number | null };

export type GrainHttpOptions = {
  token: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  version?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  onRateLimit?: (info: RateLimitInfo) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GrainHttp {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly version: string;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onRateLimit?: (info: RateLimitInfo) => void;
  readonly baseUrl: string;

  constructor(opts: GrainHttpOptions) {
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.baseUrl = (opts.baseUrl ?? GRAIN_API_BASE_URL).replace(/\/$/, "");
    this.version = opts.version ?? GRAIN_API_VERSION;
    this.maxRetries = opts.maxRetries ?? 2;
    this.sleep = opts.sleep ?? defaultSleep;
    this.onRateLimit = opts.onRateLimit;
  }

  url(path: string) {
    return `${this.baseUrl}/_/public-api/v2${path}`;
  }

  async request(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const res = await this.fetchImpl(this.url(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Public-Api-Version": this.version,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (
      this.onRateLimit &&
      (res.headers.has("x-ratelimit-limit") || res.headers.has("x-ratelimit-remaining"))
    ) {
      const limit = Number(res.headers.get("x-ratelimit-limit"));
      const remaining = Number(res.headers.get("x-ratelimit-remaining"));
      this.onRateLimit({
        limit: Number.isFinite(limit) ? limit : null,
        remaining: Number.isFinite(remaining) ? remaining : null,
      });
    }

    if (res.ok) return res;

    const retryAfter = Number(res.headers.get("retry-after"));
    if (res.status === 429 && attempt < this.maxRetries) {
      await this.sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1) * 1000);
      return this.request(path, init, attempt + 1);
    }

    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`.trim();
    try {
      const body = (await res.json()) as { error?: string; data?: string; message?: string };
      code = body.error;
      message = body.data ?? body.message ?? message;
    } catch {}
    throw new GrainApiError(
      message,
      res.status,
      code,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  async json<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
    const res = await this.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
    });
    const data: unknown = await res.json();
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new GrainSchemaError(path, parsed.error.issues);
    return parsed.data;
  }

  post<T>(path: string, schema: ZodType<T>, body?: unknown) {
    return this.json(path, schema, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  put<T>(path: string, schema: ZodType<T>, body: unknown) {
    return this.json(path, schema, { method: "PUT", body: JSON.stringify(body) });
  }

  patch<T>(path: string, schema: ZodType<T>, body: unknown) {
    return this.json(path, schema, { method: "PATCH", body: JSON.stringify(body) });
  }

  delete<T>(path: string, schema: ZodType<T>) {
    return this.json(path, schema, { method: "DELETE" });
  }

  async text(path: string) {
    const res = await this.request(path);
    return res.text();
  }
}
