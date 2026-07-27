import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/foundation/i18n'
import { DashboardPage } from './DashboardPage'

const listCases = vi.hoisted(() => vi.fn())

vi.mock('@/core/services', () => ({
  services: {
    cases: {
      list: listCases,
    },
  },
}))

vi.mock('./CaseCard', () => ({
  CaseCard: ({ item }: { item: { patientLabel: string } }) => (
    <span>{item.patientLabel}</span>
  ),
}))

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  listCases.mockReset()
  listCases.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  })
})

describe('Dashboard view switcher', () => {
  it('switches General Light → Kanban instantly and persists the choice', async () => {
    renderDashboard()

    const general = screen.getByRole('tab', {
      name: i18n.t('dashboard:views.generalLight'),
    })
    const kanban = screen.getByRole('tab', {
      name: i18n.t('dashboard:views.kanban'),
    })

    expect(general).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(kanban)

    expect(kanban).toHaveAttribute('aria-selected', 'true')
    expect(window.localStorage.getItem('dashboard.active-view.v1')).toBe('kanban')
    expect(
      await screen.findByRole('heading', {
        name: i18n.t('dashboard:kanban.title'),
      }),
    ).toBeVisible()
  })

  it('restores Kanban search and year after the dashboard remounts', async () => {
    window.localStorage.setItem('dashboard.active-view.v1', 'kanban')
    window.localStorage.setItem(
      'dashboard.kanban.view-state.v1',
      JSON.stringify({ query: 'כהן', year: 2025 }),
    )

    renderDashboard()

    expect(
      await screen.findByPlaceholderText(i18n.t('dashboard:kanban.search')),
    ).toHaveValue('כהן')
  })

  it('loads cases after the first 100 without replacing the first page', async () => {
    const makeCase = (index: number) => ({
      id: `case-${index}`,
      caseNumber: `DM-2025-${index}`,
      moduleId: 'orthopedic-foot-ankle',
      patientLabel: `Patient ${index}`,
      patientSex: 'male' as const,
      documentType: 'expert-opinion',
      jurisdictionModeId: 'default',
      documentLanguage: 'en' as const,
      status: 'draft' as const,
      openAttentionCount: 0,
      openContradictionCount: 0,
      openDisputedCount: 0,
      progressPercent: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })

    listCases.mockImplementation(
      async (query: { statuses?: string[]; limit: number; offset: number }) => {
        if (query.statuses?.length !== 10) {
          return { items: [], total: 0, limit: query.limit, offset: query.offset }
        }
        return query.offset === 0
          ? {
              items: Array.from({ length: 100 }, (_, index) => makeCase(index + 1)),
              total: 101,
              limit: query.limit,
              offset: query.offset,
            }
          : {
              items: [makeCase(101)],
              total: 101,
              limit: query.limit,
              offset: query.offset,
            }
      },
    )

    renderDashboard()
    fireEvent.click(
      screen.getByRole('tab', { name: i18n.t('dashboard:views.kanban') }),
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n.t('dashboard:kanban.loadMore'),
      }),
    )

    await waitFor(() => expect(screen.getByText('Patient 101')).toBeVisible())
    expect(listCases).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, offset: 100 }),
    )
    expect(screen.getByText('Patient 1')).toBeVisible()
  })
})
