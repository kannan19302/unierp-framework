// ─────────────────────────────────────────────────
// @unerp/framework — Unified frontend framework
// for every UniERP app and module.
//
// Layers:
//   types      — resource/module metadata (the DocType replacement)
//   client     — configured ApiClient shared by all data hooks
//   registry   — defineModule / ModuleRegistry
//   provider   — FrameworkProvider + context hooks
//   schema     — Zod generation + validation from FieldDefs
//   data       — tenant-scoped TanStack Query hooks
//   nav        — permission-filtered navigation derivation
//   permissions— RBAC guards (Guarded, RouteGuard)
//   views      — schema-driven ListView / FormView / DetailView
// ─────────────────────────────────────────────────

export * from './types';
export { ApiClient, ApiRequestError, type ApiClientConfig } from './client';
export { defineModule, defineResource, ModuleRegistry, createRegistry } from './registry';
export {
  FrameworkProvider,
  useFramework,
  useApiClient,
  useModuleRegistry,
  type FrameworkProviderProps,
  type FrameworkContextValue,
} from './provider';
export { buildZodSchema, validateValues, initialValues, type FieldErrors } from './schema';
export {
  resourceKeys,
  useResourceList,
  useResourceDoc,
  useCreateResource,
  useUpdateResource,
  useDeleteResource,
} from './data';
export {
  buildModuleNav,
  buildAppNav,
  type ResolvedNavItem,
  type ResolvedModuleNav,
} from './nav';
export {
  Guarded,
  RouteGuard,
  usePermission,
  PermissionContext,
  ProtectedComponent,
  ProtectedField,
  type GuardedProps,
} from './permissions';
export { ListView, type ListViewProps } from './views/ListView';
export { FilterBar, type FilterBarProps } from './views/FilterBar';
export {
  useSavedViews,
  savedViewsKey,
  localStorageViewStore,
  type SavedView,
  type SavedViewState,
  type SavedViewStore,
} from './views/saved-views';
export { FormView, type FormViewProps } from './views/FormView';
export { DetailView, type DetailViewProps } from './views/DetailView';
export { formatCellValue } from './views/format';
