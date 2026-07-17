'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Badge, Button, ColumnPicker, DataTable, EmptyState, InfoHint, Input, KanbanBoard,
  Pagination, Select, ViewSwitcher, exportToCsv, type Column, type KanbanItem, type ViewMode,
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
// inline cell editing, and switchable table /
// kanban / chart views with click-through drill-down
// (chart segments filter the table; kanban cards
// open the record).
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

  // ── View modes (table / kanban / chart) ─────────
  // A groupable field (explicit kanban/chart groupBy, or the status field)
  // unlocks the kanban and chart views automatically.
  const groupField = listConfig.kanban?.groupBy ?? listConfig.chart?.groupBy ?? resource.status?.field;
  const groupFieldDef = groupField ? resource.fields.find((f) => f.name === groupField) : undefined;
  const availableViews = listConfig.views ?? (groupField ? (['table', 'kanban', 'chart'] as const) : (['table'] as const));
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'chart'>('table');

  const pageSize = listConfig.pageSize ?? 20;
  // Kanban/chart need the population, not one page — fetch a wide window.
  const effectivePageSize = viewMode === 'table' ? pageSize : 200;
  const mergedFilters = { ...externalFilters, ...fieldFilters };
  const params: ListParams = {
    page: viewMode === 'table' ? page : 1,
    pageSize: effectivePageSize,
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
  const rows = result?.data ?? [];

  // ── Kanban derivation ───────────────────────────
  const kanbanColumns = useMemo(() => {
    if (!groupField) return [];
    const optionCols = groupFieldDef?.options?.map((o) => ({ key: o.value, title: o.label }));
    if (optionCols && optionCols.length > 0) return optionCols;
    const toneKeys = resource.status && resource.status.field === groupField ? Object.keys(resource.status.tones) : [];
    const dataKeys = [...new Set(rows.map((r) => String(r[groupField] ?? '—')))];
    const keys = [...new Set([...toneKeys, ...dataKeys])];
    return keys.map((k) => ({ key: k, title: k }));
  }, [groupField, groupFieldDef, resource.status, rows]);

  const titleField = resource.titleField ?? (resource.fields.some((f) => f.name === 'name') ? 'name' : resource.fields[0]?.name ?? 'id');
  const cardFields = listConfig.kanban?.cardFields
    ?? allColumnNames.filter((n) => n !== groupField && n !== titleField).slice(0, 3);
  const kanbanEditable = !!groupFieldDef && !groupFieldDef.readOnly;

  // ── Chart derivation (value distribution of groupField) ──
  const chartSegments = useMemo(() => {
    if (!groupField) return [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = String(r[groupField] ?? '—');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [groupField, rows]);

  const toneColor = (value: string): string => {
    const tone = resource.status && resource.status.field === groupField ? resource.status.tones[value] : undefined;
    switch (tone) {
      case 'success': return 'var(--color-success)';
      case 'warning': return 'var(--color-warning)';
      case 'danger': return 'var(--color-danger)';
      case 'info': return 'var(--color-info, var(--color-primary))';
      case 'neutral': return 'var(--color-text-tertiary, var(--color-text-secondary))';
      default: return 'var(--color-primary)';
    }
  };

  /** Chart/kanban drill-down: filter the table to a segment's real records. */
  const drillDown = (value: string) => {
    if (!groupField) return;
    setFieldFilters((prev) => ({ ...prev, [groupField]: value }));
    setPage(1);
    setViewMode('table');
  };

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
        {resource.description && <InfoHint text={resource.description} size={16} />}
        {availableViews.length > 1 && (
          <ViewSwitcher
            activeView={(viewMode === 'table' ? 'list' : viewMode) as ViewMode}
            onViewChange={(v) => setViewMode(v === 'list' ? 'table' : (v as 'kanban' | 'chart'))}
            availableViews={availableViews.map((v) => (v === 'table' ? 'list' : v)) as ViewMode[]}
          />
        )}
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
            title={`Download the current ${resource.labelPlural.toLowerCase()} list as a CSV file`}
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
            <Button title={`Create a new ${resource.labelSingular.toLowerCase()}`} onClick={onCreate}>
              New {resource.labelSingular}
            </Button>
          </Guarded>
        )}
      </div>

      {viewMode === 'kanban' && groupField && (
        <KanbanBoard
          columns={kanbanColumns}
          items={rows.map((row, i) => ({
            ...row,
            id: String(row[primaryKey] ?? i),
            columnKey: String(row[groupField] ?? '—'),
          })) as KanbanItem[]}
          renderCard={(item) => {
            const row = rows.find((r) => String(r[primaryKey]) === item.id) ?? (item as FieldValues);
            return (
              <div
                role={onRowClick ? 'button' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
              >
                <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                  {formatCellValue(resource.fields.find((f) => f.name === titleField), row[titleField]) || String(row[primaryKey] ?? '')}
                </span>
                {cardFields.map((name) => {
                  const field = resource.fields.find((f) => f.name === name);
                  const value = row[name];
                  if (value === null || value === undefined || value === '') return null;
                  return (
                    <span key={name} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      {field?.label ?? name}: {formatCellValue(field, value)}
                    </span>
                  );
                })}
              </div>
            );
          }}
          onCardMove={
            kanbanEditable
              ? (itemId, _from, toColumn) => updateMutation.mutate({ id: itemId, values: { [groupField]: toColumn } })
              : undefined
          }
        />
      )}

      {viewMode === 'chart' && groupField && (
        <div className="ui-card" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
              {resource.labelPlural} by {groupFieldDef?.label ?? groupField}
            </span>
            <InfoHint text="Click a bar to open the matching records in the table view" />
          </div>
          {chartSegments.length === 0 && !isLoading && (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>No data to chart.</span>
          )}
          {chartSegments.map((seg) => {
            const max = chartSegments[0]?.count ?? 1;
            return (
              <button
                key={seg.value}
                type="button"
                title={`Show the ${seg.count} ${seg.count === 1 ? resource.labelSingular.toLowerCase() : resource.labelPlural.toLowerCase()} with ${groupFieldDef?.label ?? groupField} “${seg.value}”`}
                onClick={() => drillDown(seg.value)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(90px, 160px) 1fr 48px',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  background: 'none',
                  border: 'none',
                  padding: 'var(--space-1) 0',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {groupFieldDef?.options?.find((o) => o.value === seg.value)?.label ?? seg.value}
                </span>
                <span style={{ background: 'var(--color-bg-sunken)', borderRadius: 'var(--radius-full, 999px)', height: 14, overflow: 'hidden' }}>
                  <span
                    style={{
                      display: 'block',
                      width: `${Math.max(3, Math.round((seg.count / max) * 100))}%`,
                      height: '100%',
                      borderRadius: 'inherit',
                      background: toneColor(seg.value),
                      transition: 'width var(--duration-normal, 200ms)',
                    }}
                  />
                </span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)', textAlign: 'right' }}>
                  {seg.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {viewMode === 'table' && (
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
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {total} {total === 1 ? resource.labelSingular.toLowerCase() : resource.labelPlural.toLowerCase()}
          {viewMode !== 'table' && total > effectivePageSize ? ` (showing first ${effectivePageSize})` : ''}
        </span>
        {viewMode === 'table' && <Pagination page={page} pageCount={pageCount} onChange={setPage} />}
      </div>
    </div>
  );
}
