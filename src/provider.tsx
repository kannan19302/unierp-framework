'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClient, type ApiClientConfig } from './client';
import { ModuleRegistry, createRegistry } from './registry';
import type { ModuleDefinition } from './types';

// ─────────────────────────────────────────────────
// FrameworkProvider — the single provider a host app
// mounts once. Wires the API client, module registry,
// and (optionally) a TanStack Query client.
// ─────────────────────────────────────────────────

export interface FrameworkContextValue {
  client: ApiClient;
  registry: ModuleRegistry;
}

const FrameworkContext = createContext<FrameworkContextValue | null>(null);

export interface FrameworkProviderProps {
  api: ApiClientConfig;
  modules?: ModuleDefinition[];
  /**
   * Pass an existing QueryClient to share the host app's cache; omit it if a
   * QueryClientProvider is already mounted above, or set `createQueryClient`
   * to let the framework own one.
   */
  queryClient?: QueryClient;
  /** When true and no queryClient is given, the framework creates its own. */
  createQueryClient?: boolean;
  children: ReactNode;
}

export function FrameworkProvider({
  api,
  modules = [],
  queryClient,
  createQueryClient = false,
  children,
}: FrameworkProviderProps) {
  const value = useMemo<FrameworkContextValue>(
    () => ({ client: new ApiClient(api), registry: createRegistry(modules) }),
    // Hosts pass stable literals; re-instantiating per render would nuke the cache.
    [],
  );

  const ownClient = useMemo(
    () => (queryClient ?? (createQueryClient ? new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }) : null)),
    [],
  );

  const inner = <FrameworkContext.Provider value={value}>{children}</FrameworkContext.Provider>;
  return ownClient ? <QueryClientProvider client={ownClient}>{inner}</QueryClientProvider> : inner;
}

export function useFramework(): FrameworkContextValue {
  const ctx = useContext(FrameworkContext);
  if (!ctx) throw new Error('useFramework must be used inside <FrameworkProvider>');
  return ctx;
}

export function useApiClient(): ApiClient {
  return useFramework().client;
}

export function useModuleRegistry(): ModuleRegistry {
  return useFramework().registry;
}
