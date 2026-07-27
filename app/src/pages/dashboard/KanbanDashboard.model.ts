import type { CaseStatus, CaseSummary } from '@/core/contracts/case'
import type { KeyValueStorage } from '@/core/storage'

export const KANBAN_LAYOUT_STORAGE_KEY = 'dashboard.kanban.layout.v2'
export const KANBAN_LEGACY_LAYOUT_STORAGE_KEY = 'dashboard.kanban.layout.v1'
export const KANBAN_VIEW_STATE_STORAGE_KEY = 'dashboard.kanban.view-state.v1'
export const KANBAN_SCROLL_STORAGE_KEY = 'dashboard.kanban.scroll.v1'

export type KanbanColumnId =
  | 'incoming'
  | 'working'
  | 'attention'
  | 'review'
  | 'done'
  | `custom-${string}`

export interface KanbanColumn {
  id: KanbanColumnId
  /**
   * null means that the built-in column title is resolved through i18n.
   * A string is a user-owned title and must never be translated.
   */
  title: string | null
  color: string
}

export interface KanbanLayout {
  columns: KanbanColumn[]
  placement: Record<string, KanbanColumnId>
  /**
   * Remembers where status-mapped cards must go after a built-in column is
   * removed. This also covers cards that have not been loaded yet.
   */
  statusPlacement: Partial<Record<CaseStatus, KanbanColumnId>>
}

export interface KanbanViewState {
  query: string
  year: number | 'all'
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const DEFAULT_COLUMNS: readonly KanbanColumn[] = [
  { id: 'incoming', title: null, color: '#66889a' },
  { id: 'working', title: null, color: '#b47a38' },
  { id: 'attention', title: null, color: '#b7545e' },
  { id: 'review', title: null, color: '#7c6aad' },
  { id: 'done', title: null, color: '#3f8b6c' },
]

const LEGACY_RUSSIAN_TITLES: Partial<Record<KanbanColumnId, string>> = {
  incoming: 'Новые',
  working: 'В работе',
  attention: 'Требуют внимания',
  review: 'Проверка',
  done: 'Готово',
}

export function createDefaultLayout(): KanbanLayout {
  return {
    columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
    placement: {},
    statusPlacement: {},
  }
}

export function defaultColumnFor(status: CaseStatus): KanbanColumnId {
  if (status === 'needs_attention' || status === 'error') return 'attention'
  if (status === 'ready_for_review') return 'review'
  if (status === 'finalized' || status === 'archived') return 'done'
  if (status === 'draft' || status === 'documents_uploaded') return 'incoming'
  return 'working'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isColumn(value: unknown): value is KanbanColumn {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    (value.title === null || typeof value.title === 'string') &&
    typeof value.color === 'string' &&
    HEX_COLOR.test(value.color)
  )
}

function stringRecord(value: unknown): Record<string, KanbanColumnId> | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value)
  if (!entries.every(([, item]) => typeof item === 'string' && item.length > 0)) {
    return null
  }
  return Object.fromEntries(entries) as Record<string, KanbanColumnId>
}

function validateLayout(value: unknown): KanbanLayout | null {
  if (!isRecord(value) || !Array.isArray(value.columns) || value.columns.length === 0) {
    return null
  }
  if (!value.columns.every(isColumn)) return null
  const ids = value.columns.map((column) => column.id)
  if (new Set(ids).size !== ids.length) return null

  const placement = stringRecord(value.placement)
  const statusPlacement = stringRecord(value.statusPlacement)
  if (!placement || !statusPlacement) return null

  return {
    columns: value.columns,
    placement,
    statusPlacement: statusPlacement as Partial<Record<CaseStatus, KanbanColumnId>>,
  }
}

function migrateLegacyLayout(value: unknown): KanbanLayout | null {
  if (!isRecord(value) || !Array.isArray(value.columns) || value.columns.length === 0) {
    return null
  }
  const legacyColumns = value.columns
  if (
    !legacyColumns.every(
      (column) =>
        isRecord(column) &&
        typeof column.id === 'string' &&
        column.id.length > 0 &&
        typeof column.title === 'string' &&
        typeof column.color === 'string' &&
        HEX_COLOR.test(column.color),
    )
  ) {
    return null
  }
  const ids = legacyColumns.map((column) => column.id as string)
  if (new Set(ids).size !== ids.length) return null
  const placement = stringRecord(value.placement)
  if (!placement) return null

  return {
    columns: legacyColumns.map((column) => {
      const id = column.id as KanbanColumnId
      const legacyTitle = column.title as string
      return {
        id,
        title: LEGACY_RUSSIAN_TITLES[id] === legacyTitle ? null : legacyTitle,
        color: column.color as string,
      }
    }),
    placement,
    statusPlacement: {},
  }
}

export function readLayout(storage: KeyValueStorage): KanbanLayout {
  const current = storage.getItem(KANBAN_LAYOUT_STORAGE_KEY)
  if (current) {
    try {
      const parsed = validateLayout(JSON.parse(current))
      if (parsed) return parsed
    } catch {
      // Invalid settings must not prevent the dashboard from opening.
    }
  }

  const legacy = storage.getItem(KANBAN_LEGACY_LAYOUT_STORAGE_KEY)
  if (legacy) {
    try {
      const migrated = migrateLegacyLayout(JSON.parse(legacy))
      if (migrated) return migrated
    } catch {
      // Keep the legacy value untouched and fall back safely.
    }
  }

  return createDefaultLayout()
}

export function readViewState(storage: KeyValueStorage): KanbanViewState {
  const raw = storage.getItem(KANBAN_VIEW_STATE_STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (
        isRecord(parsed) &&
        typeof parsed.query === 'string' &&
        (parsed.year === 'all' ||
          (typeof parsed.year === 'number' &&
            Number.isInteger(parsed.year) &&
            parsed.year >= 1900 &&
            parsed.year <= 2999))
      ) {
        return { query: parsed.query, year: parsed.year }
      }
    } catch {
      // Invalid transient state is safe to ignore.
    }
  }
  return { query: '', year: 'all' }
}

export function resolveColumnId(
  layout: KanbanLayout,
  item: Pick<CaseSummary, 'id' | 'status'>,
): KanbanColumnId {
  const existing = new Set(layout.columns.map((column) => column.id))
  const explicit = layout.placement[item.id]
  if (explicit && existing.has(explicit)) return explicit

  const remapped = layout.statusPlacement[item.status]
  if (remapped && existing.has(remapped)) return remapped

  const builtIn = defaultColumnFor(item.status)
  if (existing.has(builtIn)) return builtIn
  return layout.columns[0]?.id ?? 'incoming'
}

export function removeColumn(
  layout: KanbanLayout,
  deletedId: KanbanColumnId,
  targetId: KanbanColumnId,
  loadedCases: readonly Pick<CaseSummary, 'id' | 'status'>[],
): KanbanLayout {
  if (
    layout.columns.length <= 1 ||
    deletedId === targetId ||
    !layout.columns.some((column) => column.id === deletedId) ||
    !layout.columns.some((column) => column.id === targetId)
  ) {
    return layout
  }

  const placement = { ...layout.placement }
  for (const [caseId, columnId] of Object.entries(placement)) {
    if (columnId === deletedId) placement[caseId] = targetId
  }
  for (const item of loadedCases) {
    if (resolveColumnId(layout, item) === deletedId) placement[item.id] = targetId
  }

  const statusPlacement = { ...layout.statusPlacement }
  for (const status of [
    'draft',
    'documents_uploaded',
    'phi_review',
    'processing',
    'analyzing',
    'needs_attention',
    'ready_for_review',
    'finalized',
    'archived',
    'error',
  ] satisfies CaseStatus[]) {
    if (
      statusPlacement[status] === deletedId ||
      (!statusPlacement[status] && defaultColumnFor(status) === deletedId)
    ) {
      statusPlacement[status] = targetId
    }
  }

  return {
    columns: layout.columns.filter((column) => column.id !== deletedId),
    placement,
    statusPlacement,
  }
}
