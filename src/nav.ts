import type { ModuleDefinition, NavItemDef } from './types';

// ─────────────────────────────────────────────────
// Navigation derivation — sidebar entries generated
// from module definitions, filtered by permissions.
// ─────────────────────────────────────────────────

export interface ResolvedNavItem {
  name: string;
  href: string;
}

export interface ResolvedModuleNav {
  moduleId: string;
  title: string;
  items: ResolvedNavItem[];
}

/**
 * Build the sidebar for a module: one entry per resource (at
 * `basePath/resourceName`) plus any custom nav items, dropping everything the
 * user lacks permission for. `hasPermission` should come from the host's
 * PermissionContext.
 */
export function buildModuleNav(
  module: ModuleDefinition,
  hasPermission: (code: string) => boolean = () => true,
): ResolvedModuleNav | null {
  if (module.permission && !hasPermission(module.permission)) return null;

  const items: ResolvedNavItem[] = [];
  for (const resource of module.resources) {
    const readPermission = resource.permissions?.read;
    if (readPermission && !hasPermission(readPermission)) continue;
    items.push({ name: resource.labelPlural, href: `${module.basePath}/${resource.name}` });
  }
  for (const item of module.nav ?? []) {
    if (item.permission && !hasPermission(item.permission)) continue;
    items.push(resolveNavItem(module, item));
  }
  return { moduleId: module.id, title: module.title, items };
}

function resolveNavItem(module: ModuleDefinition, item: NavItemDef): ResolvedNavItem {
  const href = item.href.startsWith('/') ? item.href : `${module.basePath}/${item.href}`;
  return { name: item.name, href };
}

/** Build the full app navigation across all registered modules. */
export function buildAppNav(
  modules: ModuleDefinition[],
  hasPermission: (code: string) => boolean = () => true,
): ResolvedModuleNav[] {
  return modules
    .map((m) => buildModuleNav(m, hasPermission))
    .filter((nav): nav is ResolvedModuleNav => nav !== null && nav.items.length > 0);
}
