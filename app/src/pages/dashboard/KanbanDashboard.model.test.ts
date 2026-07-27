import { describe, expect, it } from 'vitest'
import type { CaseStatus } from '@/core/contracts/case'
import type { KeyValueStorage } from '@/core/storage'
import {
  KANBAN_LAYOUT_STORAGE_KEY,
  KANBAN_LEGACY_LAYOUT_STORAGE_KEY,
  KANBAN_VIEW_STATE_STORAGE_KEY,
  createDefaultLayout,
  readLayout,
  readViewState,
  removeColumn,
  resolveColumnId,
} from './KanbanDashboard.model'

function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage {
  const values = new Map(Object.entries(seed))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function item(id: string, status: CaseStatus) {
  return { id, status }
}

describe('Kanban dashboard model', () => {
  it('uses language-neutral built-in titles for a new layout', () => {
    expect(createDefaultLayout().columns.map((column) => column.title)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('migrates legacy Russian defaults without losing a custom title', () => {
    const storage = memoryStorage({
      [KANBAN_LEGACY_LAYOUT_STORAGE_KEY]: JSON.stringify({
        columns: [
          { id: 'incoming', title: 'Новые', color: '#66889a' },
          { id: 'working', title: 'Сегодня', color: '#b47a38' },
        ],
        placement: {},
      }),
    })

    const layout = readLayout(storage)
    expect(layout.columns[0].title).toBeNull()
    expect(layout.columns[1].title).toBe('Сегодня')
  })

  it('rejects duplicate column ids in persisted v2 state', () => {
    const storage = memoryStorage({
      [KANBAN_LAYOUT_STORAGE_KEY]: JSON.stringify({
        columns: [
          { id: 'incoming', title: null, color: '#66889a' },
          { id: 'incoming', title: null, color: '#b47a38' },
        ],
        placement: {},
        statusPlacement: {},
      }),
    })

    expect(readLayout(storage)).toEqual(createDefaultLayout())
  })

  it('restores the search query and selected year', () => {
    const storage = memoryStorage({
      [KANBAN_VIEW_STATE_STORAGE_KEY]: JSON.stringify({
        query: 'כהן',
        year: 2025,
      }),
    })

    expect(readViewState(storage)).toEqual({ query: 'כהן', year: 2025 })
  })

  it('moves explicit and status-mapped cards when a built-in column is deleted', () => {
    const layout = createDefaultLayout()
    layout.placement.explicit = 'incoming'
    const next = removeColumn(
      layout,
      'incoming',
      'working',
      [item('implicit', 'draft'), item('explicit', 'ready_for_review')],
    )

    expect(next.columns.some((column) => column.id === 'incoming')).toBe(false)
    expect(resolveColumnId(next, item('implicit', 'draft'))).toBe('working')
    expect(resolveColumnId(next, item('explicit', 'ready_for_review'))).toBe('working')
    expect(resolveColumnId(next, item('future', 'draft'))).toBe('working')
  })
})
