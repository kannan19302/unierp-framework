import type { ReactNode } from 'react';
import type { FieldDef } from '../types';

/** Render a raw API value for display according to its field type. */
export function formatCellValue(field: FieldDef | undefined, value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  switch (field?.type) {
    case 'currency':
      return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'percent':
      return `${Number(value).toLocaleString()}%`;
    case 'number':
      return Number(value).toLocaleString();
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'date':
      return new Date(String(value)).toLocaleDateString();
    case 'datetime':
      return new Date(String(value)).toLocaleString();
    case 'select': {
      const option = field.options?.find((o) => o.value === value);
      return option?.label ?? String(value);
    }
    default:
      return String(value);
  }
}
