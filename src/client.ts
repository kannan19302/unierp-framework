import type { FieldValues, ListParams, ListResult } from './types';

// ─────────────────────────────────────────────────
// ApiClient — the single HTTP gateway for every
// framework-powered module. Host apps configure it
// once (base URL, auth, CSRF, tenant) and all data
// hooks route through it.
// ─────────────────────────────────────────────────

export class ApiRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  /** Bearer token provider; return null when unauthenticated */
  getToken?: () => string | null;
  /** CSRF token provider, attached as x-csrf-token on mutating requests */
  getCsrfToken?: () => string | null;
  /** Tenant id provider — also used to scope the query cache */
  getTenantId?: () => string | null;
  /** Called on 401 responses so the host app can redirect to login */
  onUnauthorized?: () => void;
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  get tenantId(): string | null {
    return this.config.getTenantId?.() ?? null;
  }

  async request<T = unknown>(path: string, options: RequestInit = {}, responseType: 'json' | 'text' | 'blob' = 'json'): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.config.baseUrl}${path}`;
    const headers = new Headers(options.headers);
    const method = (options.method || 'GET').toUpperCase();

    if (!headers.has('Content-Type') && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    const token = this.config.getToken?.();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!SAFE_METHODS.includes(method)) {
      const csrf = this.config.getCsrfToken?.();
      if (csrf) headers.set('x-csrf-token', csrf);
    }

    const res = await fetch(url, { ...options, headers, credentials: 'include' });

    if (res.status === 401) this.config.onUnauthorized?.();

    if (!res.ok) {
      let message = res.statusText || 'Request failed';
      try {
        const body = (await res.json()) as { message?: string | string[] };
        if (body.message) {
          message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        }
      } catch {
        // non-JSON error body — keep the status text
      }
      throw new ApiRequestError(message, res.status);
    }

    if (res.status === 204) return undefined as T;
    if (responseType === 'text') return (await res.text()) as T;
    if (responseType === 'blob') return (await res.blob()) as T;
    return (await res.json()) as T;
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  text(path: string): Promise<string> {
    return this.request<string>(path, {}, 'text');
  }

  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /**
   * Fetch a list endpoint and normalize the response into ListResult,
   * accepting either a bare array or `{ data, total }` / `{ items, total }` envelopes.
   */
  async list<T = FieldValues>(endpoint: string, params: ListParams = {}): Promise<ListResult<T>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    // Emit both dialects — `pageSize`/`sortField` and the NestJS convention
    // `limit`/`sort` ("-field" for desc); servers ignore what they don't read.
    qs.set('pageSize', String(pageSize));
    qs.set('limit', String(pageSize));
    if (params.search) qs.set('search', params.search);
    if (params.sortField) {
      qs.set('sortField', params.sortField);
      qs.set('sortDirection', params.sortDirection ?? 'asc');
      qs.set('sort', `${params.sortDirection === 'desc' ? '-' : ''}${params.sortField}`);
      // CRM-style dialect
      qs.set('sortBy', params.sortField);
      qs.set('sortOrder', params.sortDirection ?? 'asc');
    }
    for (const [key, value] of Object.entries(params.filters ?? {})) {
      if (value !== undefined && value !== '') qs.set(key, String(value));
    }

    const raw = await this.get<unknown>(`${endpoint}?${qs.toString()}`);

    if (Array.isArray(raw)) {
      return { data: raw as T[], total: raw.length, page, pageSize };
    }
    const envelope = raw as {
      data?: T[];
      items?: T[];
      total?: number;
      totalCount?: number;
      meta?: { total?: number };
    };
    const data = envelope.data ?? envelope.items ?? [];
    return {
      data,
      total: envelope.total ?? envelope.totalCount ?? envelope.meta?.total ?? data.length,
      page,
      pageSize,
    };
  }
}
