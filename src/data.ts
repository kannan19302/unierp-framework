'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useApiClient } from './provider';
import type { FieldValues, ListParams, ListResult, ResourceSchema } from './types';

// ─────────────────────────────────────────────────
// Data hooks — tenant-scoped TanStack Query wrappers.
// All cache keys are prefixed with the tenant id so a
// tenant switch can never leak cached rows.
// ─────────────────────────────────────────────────

export function resourceKeys(tenantId: string | null, resource: string) {
  const root = ['unerp', tenantId ?? 'no-tenant', resource] as const;
  return {
    all: root,
    list: (params: ListParams) => [...root, 'list', params] as const,
    doc: (id: string) => [...root, 'doc', id] as const,
  };
}

export function useResourceList<T = FieldValues>(
  resource: ResourceSchema,
  params: ListParams = {},
): UseQueryResult<ListResult<T>> {
  const client = useApiClient();
  return useQuery({
    queryKey: resourceKeys(client.tenantId, resource.name).list(params),
    queryFn: () => client.list<T>(resource.endpoint, params),
    placeholderData: (prev) => prev,
  });
}

export function useResourceDoc<T = FieldValues>(
  resource: ResourceSchema,
  id: string | null | undefined,
): UseQueryResult<T> {
  const client = useApiClient();
  return useQuery({
    queryKey: resourceKeys(client.tenantId, resource.name).doc(id ?? ''),
    queryFn: () => client.get<T>(`${resource.endpoint}/${id}`),
    enabled: !!id,
  });
}

function useInvalidate(resource: ResourceSchema) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: resourceKeys(client.tenantId, resource.name).all });
}

export function useCreateResource<T = FieldValues>(
  resource: ResourceSchema,
): UseMutationResult<T, Error, FieldValues> {
  const client = useApiClient();
  const invalidate = useInvalidate(resource);
  return useMutation({
    mutationFn: (values: FieldValues) => client.post<T>(resource.endpoint, values),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateResource<T = FieldValues>(
  resource: ResourceSchema,
): UseMutationResult<T, Error, { id: string; values: FieldValues }> {
  const client = useApiClient();
  const invalidate = useInvalidate(resource);
  return useMutation({
    mutationFn: ({ id, values }) => client.patch<T>(`${resource.endpoint}/${id}`, values),
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteResource(resource: ResourceSchema): UseMutationResult<unknown, Error, string> {
  const client = useApiClient();
  const invalidate = useInvalidate(resource);
  return useMutation({
    mutationFn: (id: string) => client.delete(`${resource.endpoint}/${id}`),
    onSuccess: () => void invalidate(),
  });
}
