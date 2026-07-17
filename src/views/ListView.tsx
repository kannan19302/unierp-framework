'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Badge, Button, ColumnPicker, DataTable, EmptyState, Input, Pagination, Select,
  exportToCsv, type Column,
} from '@unerp/ui';
import { useDeleteResource, useResourceList, useUpdateResource } from '../data';
import { Guarded } from '../permissions';
import { formatCellValue } from './format';
import { FilterBar } from './FilterBar';
import { useSavedViews, type SavedViewState } from './saved-views';
import type { FieldDef, FieldValues, FilterValues, ListParams, ResourceSchema, SortDirection } from '../types';

// ─────────────────────────────────────────────────
// ListView — schema-driven list page: server-side
// pagination/sort/search, field-driven filter bar,
// saved views, multi-select with RBAC-gated bulk
// delete, row actions, column picker, CSV export,
// and inline cell editing.
// ─────────────────────────────────────────────────

export interface ListViewProps {
  resource: ResourceSchema;
  onRowClick?: (row: FieldValues) => void;
  onCreate?: () => void;
  /** Extra server-side filters merged into every request */
  filters?: Record<string, string | number | boolean | undefined>;
  /** Extra toolbar content (filter dropdowns, export buttons, …) */
  toolbar?: ReactNode;
}

const INLINE_EDITABLE_TYPES = new Set(['text', 'number', 'currency', 'percent', 'select', 'email', 'phone']);

function InlineCell({
  field, value, onSave,
}: { field: FieldDef; value: unknown; onSave: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!editing) {
    return (
      <span
        title="Double-click to edit"
        style={{ cursor: 'text', display: 'inline-block', minWidth: 40, minHeight: '1em' }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(value === null || value === undefined ? '' : String(value));
          setEditing(true);
        }}
      >
        {formatCellValue(field, value)}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    const raw = draft.trim();
    const next =
      ['number', 'currency', 'percent'].includes(field.type)
        ? raw === '' ? null : Number(raw)
        : raw;
    if (String(value ?? '') !== String(next ?? '')) onSave(next);
  };
  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  };

  if (field.type === 'select') {
    return (
      <Select
        autoFocus
        aria-label={`Edit ${field.label}`}
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={keyHandler}
        style={{ minWidth: 120 }}
      >
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    );
  }
  return (
    <Input
      autoFocus
      aria-label={`Edit ${field.label}`}
      type={['number', 'currency', 'percent'].includes(field.type) ? 'number' : 'text'}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={keyHandler}
      style={{ maxWidth: 160 }}
    />
  );
}

export function ListView({ resource, onRowClick, onCreate, filters: externalFilters, toolbar }: ListViewProps) {
  const listConfig = resource.list ?? {};
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(listConfig.defaultSort ?? null);
  const [fieldFilters, setFieldFilters] = useState<FilterValues>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(null);
  const [activeViewId, setActiveViewId] = useState('');

  const pageSize = listConfig.pageSize ?? 20;
  const mergedFilters = { ...externalFilters, ...fieldFilters };
  const params: ListParams = {
    page,
    pageSize,
    search: search || undefined,
    sortField: sort?.field,
    sortDirection: sort?.direction,
    filters: mergedFilters,
  };
  const { data: result, isLoading, isError, error, refetch } = useResourceList(resource, params);
  const updateMutation = useUpdateResource(resource);
  const deleteMutation = useDeleteResource(resource);
  const { views, saveView, removeView } = useSavedViews(resource.name);

  const primaryKey = resource.primaryKey ?? 'id';
  const allColumnNames = listConfig.columns ?? resource.fields.slice(0, 5).map((f) => f.name);
  const columnNames = visibleColumns ? allColumnNames.filter((n) => visibleColumns.includes(n)) : allColumnNames;
  const inlineEditable = new Set(listConfig.inlineEdit ?? []);

  const columns = useMemo<Column<FieldValues>[]>(() => {
    const cols: Column<FieldValues>[] = columnNames.map((name) => {
      const field = resource.fields.find((f) => f.name === name);
      const custom = listConfig.render?.[name];
      const isStatus = resource.status?.field === name;
      const align = field && ['number', 'currency', 'percent'].includes(field.type) ? 'right' : 'left';
      const canInlineEdit = !!field && inlineEditable.has(name) && INLINE_EDITABLE_TYPES.has(field.type) && !field.readOnly;
      // Virtual columns (no field def) are render-only and not sortable
      const header = field ? (
        <span
          role="button"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() =>
            setSort((prev) => {
              const direction: SortDirection = prev?.field === name && prev.direction === 'asc' ? 'desc' : 'asc';
              return { field: name, direction };
            })
          }
        >
          {field.label}
          {sort?.field === name ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
        </span>
      ) : (
        name.replace(/^\w/, (c) => c.toUpperCase())
      );
      return {
        key: name,
        align,
        header,
        exportValue: (row: FieldValues) => {
          const v = row[name];
          return v === null || v === undefined || typeof v === 'object' ? (v == null ? '' : JSON.stringify(v)) : (v as string | number | boolean);
        },
        render: (row: FieldValues) => {
          if (custom) return custom(row);
          const value = row[name];
          if (isStatus && resource.status) {
            const tone = resource.status.tones[String(value)] ?? 'neutral';
            return <Badge variant={tone === 'neutral' ? 'default' : tone}>{String(value ?? '')}</Badge>;
          }
          if (canInlineEdit && field) {
            return (
              <InlineCell
                field={field}
                value={value}
                onSave={(v) => updateMutation.mutate({ id: String(row[primaryKey]), values: { [name]: v } })}
              />
            );
          }
          return formatCellValue(field, value);
        },
      };
    });

    const rowActions = listConfig.rowActions ?? [];
    if (rowActions.length > 0) {
      cols.push({
        key: '__actions',
        header: '',
        align: 'right',
        exportValue: () => '',
        render: (row: FieldValues) => (
          <span style={{ display: 'inline-flex', gap: 'var(--space-1)' }} onClick={(e) => e.stopPropagation()}>
            {rowActions.map((a) => (
              <Guarded key={a.label} permission={a.permission}>
                <Button variant={a.tone === 'danger' ? 'danger' : 'ghost'} size="sm" onClick={() => a.onClick(row)}>
                  {a.label}
                </Button>
              </Guarded>
            ))}
          </span>
        ),
      });
    }
    return cols;
  }, [resource, sort, columnNames.join('|'), listConfig.rowActions, primaryKey]);

  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const currentState = (): SavedViewState => ({ search: search || undefined, filters: fieldFilters, sort });
  const applyView = (id: string) => {
    setActiveViewId(id);
    const view = views.find((v) => v.id === id);
    if (!view) return;
    setSearch(view.state.search ?? '');
    setFieldFilters(view.state.filters ?? {});
    setSort(view.state.sort ?? listConfig.defaultSort ?? null);
    setPage(1);
  };

  if (isError) {
    return (
      <EmptyState
        title={`Couldn't load ${resource.labelPlural.toLowerCase()}`}
        description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        action={<Button onClick={() => void refetch()}>Retry</Button>}
      />
    );
  }

  const selectable = !!listConfig.selectable;
  const exportable = listConfig.exportable !== false;
  const showColumnPicker = listConfig.columnPicker !== false && allColumnNames.length > 1;
  const savedViewsEnabled = !!listConfig.savedViews;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        {listConfig.searchable !== false && (
          <Input
            placeholder={`Search ${resource.labelPlural.toLowerCase()}…`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 320 }}
          />
        )}
        <FilterBar
          resource={resource}
          values={fieldFilters}
          onChange={(v) => {
            setFieldFilters(v);
            setPage(1);
          }}
        />
        {savedViewsEnabled && (
          <span style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}>
            <Select
              aria-label="Saved views"
              value={activeViewId}
              onChange={(e) => applyView(e.target.value)}
              style={{ minWidth: 150 }}
            >
              <option value="">Saved views…</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const name = window.prompt('Save current view as…');
                if (name?.trim()) {
                  const view = saveView(name.trim(), currentState());
                  setActiveViewId(view.id);
                }
              }}
            >
              Save view
            </Button>
            {activeViewId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  removeView(activeViewId);
                  setActiveViewId('');
                }}
              >
                Delete view
              </Button>
            )}
          </span>
        )}
        {toolbar}
        <div style={{ flex: 1 }} />
        {exportable && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!result?.data?.length}
            onClick={() => exportToCsv(columns.filter((c) => c.key !== '__actions'), result?.data ?? [], resource.labelPlural.toLowerCase().replace(/\s+/g, '-'))}
          >
            Export CSV
          </Button>
        )}
        {showColumnPicker && (
          <ColumnPicker
            options={allColumnNames.map((n) => ({
              key: n,
              label: resource.fields.find((f) => f.name === n)?.label ?? n,
            }))}
            visible={columnNames}
            onChange={setVisibleColumns}
          />
        )}
        {onCreate && (
          <Guarded permission={resource.permissions?.create}>
            <Button onClick={onCreate}>New {resource.labelSingular}</Button>
          </Guarded>
        )}
      </div>

      <DataTable<FieldValues>
        columns={columns}
        data={result?.data ?? []}
        loading={isLoading}
        rowKey={(row, i) => String(row[primaryKey] ?? i)}
        onRowClick={onRowClick}
        emptyTitle={`No ${resource.labelPlural.toLowerCase()} yet`}
        emptyMessage={`Create your first ${resource.labelSingular.toLowerCase()} to get started.`}
        selectedKeys={selectable ? selected : undefined}
        onSelectionChange={selectable ? setSelected : undefined}
        bulkActions={
          selectable
            ? (keys) => (
                <Guarded permission={resource.permissions?.delete}>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={async () => {
                      if (!window.confirm(`Delete ${keys.length} ${keys.length === 1 ? resource.labelSingular.toLowerCase() : resource.labelPlural.toLowerCase()}?`)) return;
                      for (const id of keys) {
                        // Sequential to keep server load and error attribution simple
                        await deleteMutation.mutateAsync(id);
                      }
                      setSelected([]);
                    }}
                  >
                    Delete selected
                  </Button>
                </Guarded>
              )
            : undefined
        }
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {total} {total === 1 ? resource.labelSingular.toLowerCase() : resource.labelPlural.toLowerCase()}
        </span>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
    </div>
  );
}
