import { z, type ZodTypeAny } from 'zod';
import type { FieldDef, FieldValues, ResourceSchema } from './types';

// ─────────────────────────────────────────────────
// Zod schema generation — every resource form is
// validated by a schema derived from its FieldDefs.
// ─────────────────────────────────────────────────

function fieldToZod(field: FieldDef): ZodTypeAny {
  let base: ZodTypeAny;
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'percent': {
      let num = z.coerce.number({ invalid_type_error: `${field.label} must be a number` });
      if (field.min !== undefined) num = num.min(field.min, `${field.label} must be ≥ ${field.min}`);
      if (field.max !== undefined) num = num.max(field.max, `${field.label} must be ≤ ${field.max}`);
      base = num;
      break;
    }
    case 'boolean':
      base = z.coerce.boolean();
      break;
    case 'email':
      base = z.string().email(`${field.label} must be a valid email`);
      break;
    case 'select': {
      const values = (field.options ?? []).map((o) => o.value);
      base = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
      break;
    }
    case 'date':
    case 'datetime':
      base = z.string().min(1, `${field.label} is required`);
      break;
    default: {
      let str = z.string();
      if (field.maxLength !== undefined) str = str.max(field.maxLength, `${field.label} must be at most ${field.maxLength} characters`);
      base = str;
      break;
    }
  }

  if (field.required) {
    if (field.type !== 'number' && field.type !== 'currency' && field.type !== 'percent' && field.type !== 'boolean' && field.type !== 'email' && field.type !== 'select') {
      base = (base as z.ZodString).min(1, `${field.label} is required`);
    }
    return base;
  }
  // Optional fields accept empty string / undefined / null
  return z.union([base, z.literal(''), z.undefined(), z.null()]);
}

/** Build the Zod object schema for a resource's editable fields. */
export function buildZodSchema(resource: ResourceSchema): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const field of resource.fields) {
    if (field.readOnly) continue;
    shape[field.name] = fieldToZod(field);
  }
  return z.object(shape);
}

export interface FieldErrors {
  [fieldName: string]: string;
}

/**
 * Validate form values: generated Zod schema first, then per-field custom
 * validators and conditional visibility (hidden fields are never validated).
 */
export function validateValues(resource: ResourceSchema, values: FieldValues): FieldErrors {
  const errors: FieldErrors = {};
  const visible = resource.fields.filter((f) => !f.readOnly && (!f.visibleIf || f.visibleIf(values)));

  const schema = buildZodSchema(resource);
  const result = schema.safeParse(values);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const name = String(issue.path[0] ?? '');
      // Only report errors for currently-visible fields
      if (name && visible.some((f) => f.name === name) && !errors[name]) {
        errors[name] = issue.message;
      }
    }
  }

  for (const field of visible) {
    if (errors[field.name]) continue;
    const custom = field.validate?.(values[field.name], values);
    if (custom) errors[field.name] = custom;
  }
  return errors;
}

/** Initial form values from field defaults (or an existing record). */
export function initialValues(resource: ResourceSchema, record?: FieldValues): FieldValues {
  const values: FieldValues = {};
  for (const field of resource.fields) {
    const existing = record?.[field.name];
    values[field.name] = existing !== undefined ? existing : field.defaultValue ?? (field.type === 'boolean' ? false : '');
  }
  return values;
}
