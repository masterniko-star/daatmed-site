import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Palette,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import { Alert, Button, EmptyState, Icon, Skeleton } from '@/foundation/ui'
import { services } from '@/core/services'
import { appStorage } from '@/core/storage'
import type { CaseStatus, CaseSummary } from '@/core/contracts/case'
import { CaseCard } from './CaseCard'
import {
  KANBAN_LAYOUT_STORAGE_KEY,
  KANBAN_SCROLL_STORAGE_KEY,
  KANBAN_VIEW_STATE_STORAGE_KEY,
  readLayout,
  readViewState,
  removeColumn,
  resolveColumnId,
  type KanbanColumn,
  type KanbanColumnId,
  type KanbanLayout,
} from './KanbanDashboard.model'
import styles from './KanbanDashboard.module.css'

const PAGE_SIZE = 100

const ALL_STATUSES: CaseStatus[] = [
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
]

function yearOf(item: CaseSummary): number {
  return Number(item.createdAt.slice(0, 4))
}

interface ColumnEditorState {
  id: KanbanColumnId | null
  title: string
  color: string
  moveTo: KanbanColumnId | ''
}

export function KanbanDashboard() {
  const { t } = useTranslation('dashboard')
  const { t: tc } = useTranslation()
  const boardRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<KanbanLayout>(() => readLayout(appStorage))
  const [viewState, setViewState] = useState(() => readViewState(appStorage))
  const [editor, setEditor] = useState<ColumnEditorState | null>(null)
  const { query, year } = viewState

  const casesQuery = useInfiniteQuery({
    queryKey: ['cases', 'dashboard', 'kanban', query.trim()],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      services.cases.list({
        statuses: ALL_STATUSES,
        search: query.trim() || undefined,
        sort: 'updatedAt',
        dir: 'desc',
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length
      return nextOffset < lastPage.total ? nextOffset : undefined
    },
  })

  const cases = useMemo(
    () => casesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [casesQuery.data],
  )
  const totalCases = casesQuery.data?.pages[0]?.total ?? cases.length
  const years = useMemo(
    () =>
      [...new Set(cases.map(yearOf).filter(Number.isFinite))].sort((a, b) => b - a),
    [cases],
  )

  const visibleCases = useMemo(() => {
    return cases.filter((item) => {
      if (year !== 'all' && yearOf(item) !== year) return false
      return true
    })
  }, [cases, year])

  useEffect(() => {
    appStorage.setItem(KANBAN_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  }, [layout])

  useEffect(() => {
    appStorage.setItem(KANBAN_VIEW_STATE_STORAGE_KEY, JSON.stringify(viewState))
  }, [viewState])

  useEffect(() => {
    const raw = appStorage.getItem(KANBAN_SCROLL_STORAGE_KEY)
    const saved = raw == null ? 0 : Number(raw)
    if (boardRef.current && Number.isFinite(saved)) boardRef.current.scrollLeft = saved
  }, [])

  function columnTitle(column: KanbanColumn): string {
    return column.title ?? t(`kanban.defaultColumns.${column.id}`)
  }

  function moveCase(caseId: string, columnId: KanbanColumnId) {
    setLayout((current) => ({
      ...current,
      placement: { ...current.placement, [caseId]: columnId },
    }))
  }

  function handleDrop(event: DragEvent<HTMLElement>, columnId: KanbanColumnId) {
    event.preventDefault()
    const caseId = event.dataTransfer.getData('application/x-daatmed-case')
    if (caseId) moveCase(caseId, columnId)
  }

  function openNewColumn() {
    setEditor({
      id: null,
      title: '',
      color: '#4f8e82',
      moveTo: layout.columns[0]?.id ?? '',
    })
  }

  function openColumn(column: KanbanColumn) {
    setEditor({
      id: column.id,
      title: columnTitle(column),
      color: column.color,
      moveTo: layout.columns.find((item) => item.id !== column.id)?.id ?? '',
    })
  }

  function saveColumn() {
    if (!editor?.title.trim()) return
    setLayout((current) => {
      if (editor.id) {
        return {
          ...current,
          columns: current.columns.map((column) =>
            column.id === editor.id
              ? { ...column, title: editor.title.trim(), color: editor.color }
              : column,
          ),
        }
      }
      return {
        ...current,
        columns: [
          ...current.columns,
          {
            id: `custom-${globalThis.crypto.randomUUID()}`,
            title: editor.title.trim(),
            color: editor.color,
          },
        ],
      }
    })
    setEditor(null)
  }

  function deleteColumn() {
    if (!editor?.id || layout.columns.length === 1 || !editor.moveTo) return
    setLayout((current) =>
      removeColumn(current, editor.id!, editor.moveTo as KanbanColumnId, cases),
    )
    setEditor(null)
  }

  function reorderColumn(columnId: KanbanColumnId, delta: -1 | 1) {
    setLayout((current) => {
      const index = current.columns.findIndex((column) => column.id === columnId)
      const target = index + delta
      if (index < 0 || target < 0 || target >= current.columns.length) return current
      const columns = [...current.columns]
      const currentColumn = columns[index]
      const targetColumn = columns[target]
      if (!currentColumn || !targetColumn) return current
      columns[index] = targetColumn
      columns[target] = currentColumn
      return { ...current, columns }
    })
  }

  if (casesQuery.isError) {
    return (
      <div className={styles.statePage}>
        <Alert
          status="critical"
          actions={
            <Button size="sm" variant="secondary" onClick={() => void casesQuery.refetch()}>
              {tc('common.retry')}
            </Button>
          }
        >
          {t('loadError')}
        </Alert>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <aside className={styles.years} aria-label={t('kanban.years')}>
        <div className={styles.yearsTitle}>
          <Icon icon={CalendarDays} size={17} />
          <strong>{t('kanban.years')}</strong>
        </div>
        <button
          data-active={year === 'all'}
          onClick={() => setViewState((current) => ({ ...current, year: 'all' }))}
        >
          <span>{t('kanban.allYears')}</span>
          <b>{cases.length}</b>
        </button>
        {years.map((item) => (
          <button
            key={item}
            data-active={year === item}
            onClick={() => setViewState((current) => ({ ...current, year: item }))}
          >
            <span>{item}</span>
            <b>{cases.filter((entry) => yearOf(entry) === item).length}</b>
          </button>
        ))}
      </aside>

      <section className={styles.main}>
        <header className={styles.toolbar}>
          <div>
            <h1>{t('kanban.title')}</h1>
            <span>
              {t('kanban.caseCount', { count: visibleCases.length })}
              {' · '}
              {t('kanban.loadedCount', { loaded: cases.length, total: totalCases })}
            </span>
          </div>
          <label className={styles.search}>
            <Icon icon={Search} size={16} />
            <input
              value={query}
              onChange={(event) =>
                setViewState((current) => ({ ...current, query: event.target.value }))
              }
              placeholder={t('kanban.search')}
            />
          </label>
          {casesQuery.hasNextPage && (
            <Button
              variant="secondary"
              disabled={casesQuery.isFetchingNextPage}
              onClick={() => void casesQuery.fetchNextPage()}
            >
              {casesQuery.isFetchingNextPage
                ? t('kanban.loadingMore')
                : t('kanban.loadMore')}
            </Button>
          )}
          <Button variant="secondary" icon={Plus} onClick={openNewColumn}>
            {t('kanban.addColumn')}
          </Button>
        </header>

        {casesQuery.isPending ? (
          <div className={styles.loading}>
            <Skeleton height={180} />
            <Skeleton height={180} />
            <Skeleton height={180} />
          </div>
        ) : visibleCases.length === 0 ? (
          <EmptyState
            title={t('kanban.empty')}
            description={t('kanban.emptyHint')}
          />
        ) : (
          <div
            ref={boardRef}
            className={styles.board}
            onScroll={(event) =>
              appStorage.setItem(
                KANBAN_SCROLL_STORAGE_KEY,
                String(event.currentTarget.scrollLeft),
              )
            }
          >
            {layout.columns.map((column, index) => {
              const title = columnTitle(column)
              const items = visibleCases.filter(
                (item) => resolveColumnId(layout, item) === column.id,
              )
              return (
                <section
                  key={column.id}
                  className={styles.column}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, column.id)}
                >
                  <header className={styles.columnHeader}>
                    <i style={{ backgroundColor: column.color }} />
                    <strong>{title}</strong>
                    <span>{items.length}</span>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => reorderColumn(column.id, -1)}
                      aria-label={t('kanban.moveColumnBefore', { name: title })}
                    >
                      <Icon icon={ArrowLeft} size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={index === layout.columns.length - 1}
                      onClick={() => reorderColumn(column.id, 1)}
                      aria-label={t('kanban.moveColumnAfter', { name: title })}
                    >
                      <Icon icon={ArrowRight} size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openColumn(column)}
                      aria-label={t('kanban.editColumn', { name: title })}
                    >
                      <Icon icon={Settings2} size={15} />
                    </button>
                  </header>
                  <div className={styles.rule} style={{ backgroundColor: column.color }} />
                  <div className={styles.cards}>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={styles.card}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            'application/x-daatmed-case',
                            item.id,
                          )
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                      >
                        <CaseCard item={item} />
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className={styles.emptyColumn}>{t('kanban.emptyColumn')}</div>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </section>

      {editor && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null)
          }}
        >
          <section className={styles.dialog} role="dialog" aria-modal="true">
            <header>
              <Icon icon={Palette} size={18} />
              <strong>{editor.id ? t('kanban.editColumnTitle') : t('kanban.addColumn')}</strong>
            </header>
            <label>
              <span>{t('kanban.columnName')}</span>
              <input
                autoFocus
                value={editor.title}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
              />
            </label>
            <label>
              <span>{t('kanban.columnColor')}</span>
              <input
                type="color"
                value={editor.color}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, color: event.target.value } : current,
                  )
                }
              />
            </label>
            {editor.id && layout.columns.length > 1 && (
              <label>
                <span>{t('kanban.moveCasesTo')}</span>
                <select
                  value={editor.moveTo}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            moveTo: event.target.value as KanbanColumnId,
                          }
                        : current,
                    )
                  }
                >
                  {layout.columns
                    .filter((column) => column.id !== editor.id)
                    .map((column) => (
                      <option key={column.id} value={column.id}>
                        {columnTitle(column)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <footer>
              {editor.id && layout.columns.length > 1 && (
                <Button variant="secondary" icon={Trash2} onClick={deleteColumn}>
                  {t('kanban.deleteColumn')}
                </Button>
              )}
              <span />
              <Button variant="secondary" onClick={() => setEditor(null)}>
                {tc('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={!editor.title.trim()}
                onClick={saveColumn}
              >
                {tc('common.save')}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
