"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApiClient } from "../provider";
import type { ApiClient } from "../client";
import type { FilterValues, SortDirection } from "../types";

// ─────────────────────────────────────────────────
// Saved views — named list states (search + filters +
// sort) persisted per tenant + resource. Storage is
// pluggable; the default persists to localStorage so
// views survive reloads without a server round-trip.
// ─────────────────────────────────────────────────

export interface SavedViewState {
  search?: string;
  filters?: FilterValues;
  sort?: { field: string; direction: SortDirection } | null;
}

export interface SavedView {
  id: string;
  name: string;
  state: SavedViewState;
}

export interface SavedViewStore {
  load(key: string): SavedView[] | Promise<SavedView[]>;
  save(key: string, views: SavedView[]): void | Promise<void>;
}

export const localStorageViewStore: SavedViewStore = {
  load(key) {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as SavedView[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  save(key, views) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(views));
    } catch {
      // storage full/unavailable — saved views are best-effort
    }
  },
};

export class ServerSavedViewStore implements SavedViewStore {
  constructor(
    private readonly client: ApiClient,
    private readonly resourceName: string,
  ) {}

  load(_key: string): Promise<SavedView[]> {
    return this.client
      .get(`/saved-views?resourceName=${this.resourceName}`)
      .then((data: unknown) =>
        Array.isArray(data) ? (data as SavedView[]) : [],
      )
      .catch(() => []);
  }

  async save(key: string, views: SavedView[]): Promise<void> {
    try {
      // 1. Get current server state
      const current = await this.load(key);

      // Find deleted views (views in current but not in views parameter)
      const deleted = current.filter(
        (c) => !views.some((v) => v.name === c.name),
      );
      for (const d of deleted) {
        await this.client.delete(`/saved-views/${d.id}`).catch(() => {});
      }

      // Find created/updated views
      for (const v of views) {
        const match = current.find((c) => c.name === v.name);
        if (!match || JSON.stringify(match.state) !== JSON.stringify(v.state)) {
          await this.client
            .post("/saved-views", {
              resourceName: this.resourceName,
              name: v.name,
              state: v.state,
            })
            .catch(() => {});
        }
      }
    } catch {
      // API call failed — save is best-effort
    }
  }
}

export function savedViewsKey(
  tenantId: string | null,
  resource: string,
): string {
  return `unerp:saved-views:${tenantId ?? "no-tenant"}:${resource}`;
}

export function useSavedViews(resourceName: string, store?: SavedViewStore) {
  const client = useApiClient();

  const actualStore = useMemo(() => {
    if (store) return store;
    return client.tenantId
      ? new ServerSavedViewStore(client, resourceName)
      : localStorageViewStore;
  }, [client, resourceName, store]);

  const key = savedViewsKey(client.tenantId, resourceName);
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    const loaded = actualStore.load(key);
    if (loaded instanceof Promise) {
      loaded
        .then((data) => {
          if (Array.isArray(data)) setViews(data);
        })
        .catch(() => setViews([]));
    } else {
      if (Array.isArray(loaded)) setViews(loaded);
    }
  }, [key, actualStore]);

  const saveView = useCallback(
    (name: string, state: SavedViewState): SavedView => {
      const view: SavedView = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        state,
      };
      setViews((prev) => {
        const next = [...prev.filter((v) => v.name !== name), view];
        actualStore.save(key, next);
        return next;
      });
      return view;
    },
    [key, actualStore],
  );

  const removeView = useCallback(
    (id: string) => {
      setViews((prev) => {
        const next = prev.filter((v) => v.id !== id);
        actualStore.save(key, next);
        return next;
      });
    },
    [key, actualStore],
  );

  return { views, saveView, removeView };
}
