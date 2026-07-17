import type { ModuleDefinition, ResourceSchema } from './types';

// ─────────────────────────────────────────────────
// Module registry — modules self-describe via
// defineModule() and register once; hosts derive
// routing, navigation, and resource lookups from it.
// ─────────────────────────────────────────────────

/** Identity helper that validates and types a module definition at authoring time. */
export function defineModule(module: ModuleDefinition): ModuleDefinition {
  if (!module.id) throw new Error('defineModule: module id is required');
  if (!module.basePath.startsWith('/')) {
    throw new Error(`defineModule(${module.id}): basePath must start with "/"`);
  }
  const seen = new Set<string>();
  for (const resource of module.resources) {
    if (seen.has(resource.name)) {
      throw new Error(`defineModule(${module.id}): duplicate resource "${resource.name}"`);
    }
    seen.add(resource.name);
  }
  return module;
}

/** Identity helper for standalone resource schemas. */
export function defineResource(schema: ResourceSchema): ResourceSchema {
  return schema;
}

export class ModuleRegistry {
  private modules = new Map<string, ModuleDefinition>();

  register(module: ModuleDefinition): void {
    this.modules.set(module.id, module);
  }

  getModule(id: string): ModuleDefinition | undefined {
    return this.modules.get(id);
  }

  getModules(): ModuleDefinition[] {
    return [...this.modules.values()];
  }

  /** Look up a resource schema across all registered modules. */
  getResource(name: string): ResourceSchema | undefined {
    for (const module of this.modules.values()) {
      const found = module.resources.find((r) => r.name === name);
      if (found) return found;
    }
    return undefined;
  }
}

export function createRegistry(modules: ModuleDefinition[] = []): ModuleRegistry {
  const registry = new ModuleRegistry();
  for (const module of modules) registry.register(module);
  return registry;
}
