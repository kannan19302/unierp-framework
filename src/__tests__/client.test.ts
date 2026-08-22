import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../client";

afterEach(() => vi.unstubAllGlobals());

describe("ApiClient mutation identity", () => {
  it("adds an idempotency key to mutating requests", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/i);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({ baseUrl: "https://example.test" });
    await client.post("/items", { name: "one" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves an explicit key so a logical operation can retry safely", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("idempotency-key")).toBe("operation_retry_123");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({ baseUrl: "https://example.test" });
    await client.request("/items", {
      method: "POST",
      headers: { "Idempotency-Key": "operation_retry_123" },
      body: JSON.stringify({ name: "one" }),
    });
  });
});
