'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, FormField, Input, Select, Spinner, Textarea, useToast } from '@unerp/ui';
import { useCreateResource, useResourceDoc, useResourceList, useUpdateResource } from '../data';
import { Guarded } from '../permissions';
import { useModuleRegistry } from '../provider';
import { initialValues, validateValues, type FieldErrors } from '../schema';
import type { FieldDef, FieldValues, ResourceSchema } from '../types';

// ─────────────────────────────────────────────────
// FormView — schema-driven create/edit form with
// Zod validation, conditional visibility, dirty
// tracking, and permission-gated submission.
// ─────────────────────────────────────────────────

export interface FormViewProps {
  resource: ResourceSchema;
  /** When set, the form edits the existing record; otherwise it creates one */
  id?: string;
  onSuccess?: (record: FieldValues) => void;
  onCancel?: () => void;
  /** Rendered below the fields, above the action row */
  footer?: ReactNode;
  /** Context values merged into the initial form state (e.g. a parent record id) */
  initial?: FieldValues;
  /** Last-chance payload rewrite before submission (e.g. fold fields into a JSON attribute) */
  transform?: (payload: FieldValues) => FieldValues;
}

export function FormView({ resource, id, onSuccess, onCancel, footer, initial, transform }: FormViewProps) {
  const isEdit = !!id;
  const { data: record, isLoading } = useResourceDoc(resource, id);
  const create = useCreateResource(resource);
  const update = useUpdateResource(resource);
  const { toast } = useToast();

  const [values, setValues] = useState<FieldValues>(() => initialValues(resource, initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (record) setValues(initialValues(resource, { ...initial, ...(record as FieldValues) }));
  }, [record]);

  if (isEdit && isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
        <Spinner />
      </div>
    );
  }

  const setField = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validateValues(resource, values);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    // Only submit visible, editable fields
    let payload: FieldValues = {};
    for (const field of resource.fields) {
      if (field.readOnly) continue;
      if (field.visibleIf && !field.visibleIf(values)) continue;
      payload[field.name] = values[field.name];
    }
    if (transform) payload = transform(payload);

    try {
      const saved = isEdit
        ? await update.mutateAsync({ id: id as string, values: payload })
        : await create.mutateAsync(payload);
      toast({ title: `${resource.labelSingular} ${isEdit ? 'updated' : 'created'}`, variant: 'success' });
      setDirty(false);
      onSuccess?.(saved as FieldValues);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Save failed', variant: 'error' });
    }
  };

  const sections = resource.form?.sections ?? [{ fields: resource.fields.map((f) => f.name) }];
  const saving = create.isPending || update.isPending;
  const submitPermission = isEdit ? resource.permissions?.update : resource.permissions?.create;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {sections.map((section, si) => (
        <fieldset key={si} style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {section.title && (
            <legend style={{ fontSize: 'var(--text-md)', fontWeight: 600, padding: 0, marginBottom: 'var(--space-2)' }}>
              {section.title}
            </legend>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            {section.fields.map((name) => {
              const field = resource.fields.find((f) => f.name === name);
              if (!field) return null;
              if (field.visibleIf && !field.visibleIf(values)) return null;
              return (
                <Guarded key={name} permission={field.permission}>
                  <FormField label={field.label} htmlFor={name} required={field.required} error={errors[name] || null} hint={field.hint}>
                    <FieldInput field={field} value={values[name]} onChange={(v) => setField(name, v)} />
                  </FormField>
                </Guarded>
              );
            })}
          </div>
        </fieldset>
      ))}

      {footer}

      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Guarded permission={submitPermission}>
          <Button type="submit" disabled={saving || (isEdit && !dirty)}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : `Create ${resource.labelSingular}`}
          </Button>
        </Guarded>
      </div>
    </form>
  );
}

function LinkAutocomplete({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const registry = useModuleRegistry();
  const linkedResourceName = field.link?.resource;
  const linkedResource = linkedResourceName ? registry.getResource(linkedResourceName) : undefined;

  // The resolved autocomplete is a separate component so its data hooks are
  // never mounted without a resource: they build query keys from
  // resource.name/endpoint eagerly and throw on an unregistered target.
  if (!linkedResource) {
    return (
      <Input
        id={field.name}
        disabled={field.readOnly}
        placeholder={field.placeholder || `Enter ${field.label}...`}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <ResolvedLinkAutocomplete
      field={field}
      value={value}
      onChange={onChange}
      linkedResource={linkedResource}
    />
  );
}

function ResolvedLinkAutocomplete({
  field,
  value,
  onChange,
  linkedResource,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  linkedResource: ResourceSchema;
}) {
  const labelField = field.link?.labelField || 'name';

  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // 1. Fetch display label of selected value
  const { data: selectedDoc, isLoading: isDocLoading } = useResourceDoc(
    linkedResource,
    value && typeof value === 'string' ? value : null
  );

  // 2. Fetch search suggestions
  const { data: listResult, isLoading: isListLoading } = useResourceList(
    linkedResource,
    {
      search: isOpen ? search : '',
      pageSize: 10,
    }
  );

  // Determine what to display in the input box when not focused/searching
  const displayValue = selectedDoc ? String((selectedDoc as FieldValues)[labelField] ?? value) : (value ? String(value) : '');

  // Handle document click to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleClose = () => setIsOpen(false);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [isOpen]);

  const suggestions = listResult?.data ?? [];
  const primaryKey = linkedResource.primaryKey || 'id';

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <Input
          id={field.name}
          disabled={field.readOnly}
          placeholder={field.placeholder || `Search ${linkedResource.labelSingular}...`}
          value={isOpen ? search : displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
            if (e.target.value === '') {
              onChange('');
            }
          }}
          onFocus={() => {
            setSearch('');
            setIsOpen(true);
          }}
          style={{ paddingRight: '2.5rem' }}
        />
        <div style={{ position: 'absolute', right: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', pointerEvents: 'none' }}>
          {(isDocLoading || (isOpen && isListLoading)) && (
            <Spinner size="sm" />
          )}
          {!!value && !field.readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearch('');
                setIsOpen(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto',
              }}
            >
              ✕
            </button>
          )}
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', userSelect: 'none' }}>
            ▼
          </span>
        </div>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            maxHeight: '200px',
            overflowY: 'auto',
            backgroundColor: 'var(--color-bg-card, #ffffff)',
            border: '1px solid var(--color-border, #e2e8f0)',
            borderRadius: 'var(--border-radius-md, 6px)',
            boxShadow: 'var(--elevation-2, 0 4px 6px -1px rgba(0,0,0,0.1))',
            padding: '4px 0',
          }}
        >
          {suggestions.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              No results found
            </div>
          ) : (
            suggestions.map((item) => {
              const itemId = item[primaryKey];
              const itemLabel = String(item[labelField] ?? itemId);
              const isSelected = itemId === value;
              return (
                <div
                  key={String(itemId)}
                  onClick={() => {
                    onChange(itemId);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                    backgroundColor: isSelected
                      ? 'var(--color-primary-light, #f0fdf4)'
                      : 'transparent',
                    color: isSelected ? 'var(--color-primary, #15803d)' : 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-hover, #f8fafc)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div style={{ fontWeight: isSelected ? 600 : 400 }}>{itemLabel}</div>
                  {itemId !== itemLabel && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      ID: {String(itemId)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const common = {
    id: field.name,
    disabled: field.readOnly,
    placeholder: field.placeholder,
  };

  switch (field.type) {
    case 'textarea':
      return <Textarea {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={4} />;
    case 'select':
      return (
        <Select {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case 'boolean':
      return (
        <input
          id={field.name}
          type="checkbox"
          disabled={field.readOnly}
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
        />
      );
    case 'number':
    case 'currency':
    case 'percent':
      return (
        <Input
          {...common}
          type="number"
          step={field.type === 'number' ? 'any' : '0.01'}
          min={field.min}
          max={field.max}
          value={value === '' || value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    case 'date':
      return <Input {...common} type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'datetime':
      return <Input {...common} type="datetime-local" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <Input {...common} type="email" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <Input {...common} type="tel" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'link':
      return <LinkAutocomplete field={field} value={value} onChange={onChange} />;
    default:
      return (
        <Input
          {...common}
          type="text"
          maxLength={field.maxLength}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
