'use client';

import { Button, Input, Select } from '@unerp/ui';
import type { FieldDef, FilterValues, ResourceSchema } from '../types';

// ─────────────────────────────────────────────────
// FilterBar — server-side filter controls generated
// from FieldDefs (ListConfig.filters). Emits a flat
// FilterValues map sent as query params.
// ─────────────────────────────────────────────────

export interface FilterBarProps {
  resource: ResourceSchema;
  /** Field names to render; falls back to resource.list?.filters */
  fields?: string[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
}

function control(field: FieldDef, value: string | number | boolean | undefined, set: (v: string | undefined) => void) {
  const common = { 'aria-label': `Filter by ${field.label}` } as const;
  switch (field.type) {
    case 'select':
      return (
        <Select {...common} value={value === undefined ? '' : String(value)} onChange={(e) => set(e.target.value || undefined)} style={{ minWidth: 140 }}>
          <option value="">{field.label}: All</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
    case 'boolean':
      return (
        <Select {...common} value={value === undefined ? '' : String(value)} onChange={(e) => set(e.target.value || undefined)} style={{ minWidth: 140 }}>
          <option value="">{field.label}: All</option>
          <option value="true">{field.label}: Yes</option>
          <option value="false">{field.label}: No</option>
        </Select>
      );
    case 'date':
    case 'datetime':
      return (
        <Input
          {...common}
          type="date"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => set(e.target.value || undefined)}
          style={{ maxWidth: 170 }}
        />
      );
    case 'number':
    case 'currency':
    case 'percent':
      return (
        <Input
          {...common}
          type="number"
          placeholder={field.label}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => set(e.target.value || undefined)}
          style={{ maxWidth: 130 }}
        />
      );
    default:
      return (
        <Input
          {...common}
          placeholder={field.label}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => set(e.target.value || undefined)}
          style={{ maxWidth: 170 }}
        />
      );
  }
}

export function FilterBar({ resource, fields, values, onChange }: FilterBarProps) {
  const names = fields ?? resource.list?.filters ?? [];
  const defs = names
    .map((n) => resource.fields.find((f) => f.name === n))
    .filter((f): f is FieldDef => !!f);
  if (defs.length === 0) return null;

  const active = defs.some((f) => values[f.name] !== undefined);

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
      {defs.map((f) => (
        <span key={f.name}>
          {control(f, values[f.name], (v) => onChange({ ...values, [f.name]: v }))}
        </span>
      ))}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(Object.fromEntries(defs.map((f) => [f.name, undefined])))}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
