'use client';

import type { ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@unerp/ui';
import { useResourceDoc } from '../data';
import { Guarded } from '../permissions';
import { formatCellValue } from './format';
import type { FieldValues, ResourceSchema } from '../types';

// ─────────────────────────────────────────────────
// DetailView — schema-driven read view: title from
// titleField, status badge, all fields in a grid,
// permission-gated Edit action, extensible children.
// ─────────────────────────────────────────────────

export interface DetailViewProps {
  resource: ResourceSchema;
  id: string;
  onEdit?: () => void;
  /** Extra actions rendered next to Edit */
  actions?: ReactNode;
  /** Rendered below the field grid (tabs, related lists, history, …) */
  children?: ReactNode;
}

export function DetailView({ resource, id, onEdit, actions, children }: DetailViewProps) {
  const { data: record, isLoading, isError, error, refetch } = useResourceDoc<FieldValues>(resource, id);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
        <Spinner />
      </div>
    );
  }

  if (isError || !record) {
    return (
      <EmptyState
        title={`Couldn't load this ${resource.labelSingular.toLowerCase()}`}
        description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        action={<Button onClick={() => void refetch()}>Retry</Button>}
      />
    );
  }

  const titleField = resource.titleField ?? 'name';
  const title = String(record[titleField] ?? record[resource.primaryKey ?? 'id'] ?? '');
  const statusValue = resource.status ? record[resource.status.field] : undefined;
  const tone = resource.status && statusValue !== undefined ? resource.status.tones[String(statusValue)] ?? 'neutral' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <PageHeader
        title={title}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            {tone && <Badge variant={tone === 'neutral' ? 'default' : tone}>{String(statusValue)}</Badge>}
            {actions}
            {onEdit && (
              <Guarded permission={resource.permissions?.update}>
                <Button onClick={onEdit}>Edit</Button>
              </Guarded>
            )}
          </div>
        }
      />

      <Card>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--space-4)',
            margin: 0,
          }}
        >
          {resource.fields.map((field) => (
            <Guarded key={field.name} permission={field.permission}>
              <div>
                <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {field.label}
                </dt>
                <dd style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                  {formatCellValue(field, record[field.name])}
                </dd>
              </div>
            </Guarded>
          ))}
        </dl>
      </Card>

      {children}
    </div>
  );
}
