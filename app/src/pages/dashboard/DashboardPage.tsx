import { useId, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import {
  FilePlus2,
  ClipboardCheck,
  Stethoscope,
  FolderOpen,
  CheckCheck,
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Alert, Badge, Button, EmptyState, Skeleton } from '@/foundation/ui'
import { services } from '@/core/services'
import { appStorage } from '@/core/storage'
import type { CaseStatus, CaseSummary } from '@/core/contracts/case'
import { CaseCard } from './CaseCard'
import { useCollapsed } from './useCollapsed'
import { ReadinessDot } from '@/app/readiness/ReadinessDot'
import { HelpHint } from '@/app/help/HelpHint'
import { FolderToNewCaseButton } from '@/pages/cases/intake/FolderToNewCaseButton'
import { DashboardViewSwitcher } from './DashboardViewSwitcher'
import type { DashboardViewId } from './DashboardViewRegistry'
import { KanbanDashboard } from './KanbanDashboard'
import styles from './DashboardPage.module.css'

const DASHBOARD_SECTION_MAX = 100
const COLLAPSED_VISIBLE = 3
const VIEW_STORAGE_KEY = 'dashboard.active-view.v1'

function initialView(): DashboardViewId {
  return appStorage.getItem(VIEW_STORAGE_KEY) === 'kanban'
    ? 'kanban'
    : 'general-light'
}

function useCaseSection(key: string, statuses: CaseStatus[]) {
  return useQuery({
    queryKey: ['cases', 'dashboard', key, statuses],
    queryFn: () =>
      services.cases.list({
        statuses,
        sort: 'updatedAt',
        dir: 'desc',
        limit: DASHBOARD_SECTION_MAX,
        offset: 0,
      }),
  })
}

/**
 * Общая оболочка главной страницы. Оба дэшборда остаются смонтированными:
 * переключение не сбрасывает локальное состояние, фильтры и положение доски.
 */
export function DashboardPage() {
  const [view, setView] = useState<DashboardViewId>(initialView)

  function switchView(next: DashboardViewId) {
    appStorage.setItem(VIEW_STORAGE_KEY, next)
    setView(next)
  }

  return (
    <div className={styles.dashboardRoot}>
      <div className={styles.viewBar}>
        <DashboardViewSwitcher value={view} onValueChange={switchView} />
      </div>
      <div className={styles.viewPanel} hidden={view !== 'general-light'}>
        <GeneralLightDashboard />
      </div>
      <div className={styles.viewPanel} hidden={view !== 'kanban'}>
        <KanbanDashboard />
      </div>
    </div>
  )
}

/** Существующий General Light без изменения его внутренней логики. */
function GeneralLightDashboard() {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()

  const cont = useCaseSection('continue', [
    'draft',
    'documents_uploaded',
    'phi_review',
    'processing',
    'analyzing',
    'error',
  ])
  const attention = useCaseSection('attention', ['needs_attention'])
  const ready = useCaseSection('ready', ['ready_for_review'])
  const done = useCaseSection('done', ['finalized'])

  const [contCollapsed, toggleCont] = useCollapsed('continue')
  const [attentionCollapsed, toggleAttention] = useCollapsed('attention')
  const [readyCollapsed, toggleReady] = useCollapsed('ready')
  const [doneCollapsed, toggleDone] = useCollapsed('done')

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>{' '}
        <ReadinessDot id="dashboard" /> <HelpHint topicId="cases.statuses" />
        <FolderToNewCaseButton />
        <Button
          variant="primary"
          size="lg"
          icon={FilePlus2}
          onClick={() => navigate('/cases/new')}
        >
          {t('newCase')}
        </Button>
      </div>

      <Section
        icon={FolderOpen}
        title={t('sections.continue')}
        count={cont.data?.total}
        collapsed={contCollapsed}
        onToggle={toggleCont}
        state={sectionState(cont)}
        error={t('loadError')}
        onRetry={() => void cont.refetch()}
        empty={
          <EmptyState
            title={t('empty.continue')}
            description={t('empty.continueHint')}
          />
        }
      >
        <SectionCards items={cont.data?.items} collapsed={contCollapsed} />
      </Section>

      <Section
        icon={Stethoscope}
        title={t('sections.attention')}
        count={attention.data?.total}
        collapsed={attentionCollapsed}
        onToggle={toggleAttention}
        highlight="requires-doctor"
        state={sectionState(attention)}
        error={t('loadError')}
        onRetry={() => void attention.refetch()}
        empty={<EmptyState title={t('empty.attention')} />}
      >
        <SectionCards
          items={attention.data?.items}
          collapsed={attentionCollapsed}
        />
      </Section>

      <Section
        icon={ClipboardCheck}
        title={t('sections.ready')}
        count={ready.data?.total}
        collapsed={readyCollapsed}
        onToggle={toggleReady}
        state={sectionState(ready)}
        error={t('loadError')}
        onRetry={() => void ready.refetch()}
        empty={<EmptyState title={t('empty.ready')} />}
      >
        <SectionCards items={ready.data?.items} collapsed={readyCollapsed} />
      </Section>

      <Section
        icon={CheckCheck}
        title={t('sections.done')}
        count={done.data?.total}
        collapsed={doneCollapsed}
        onToggle={toggleDone}
        state={sectionState(done)}
        error={t('loadError')}
        onRetry={() => void done.refetch()}
        empty={<EmptyState title={t('empty.done')} />}
        footer={
          <Link to="/cases" className={styles.viewAll}>
            {t('viewAll')}
          </Link>
        }
      >
        <SectionCards items={done.data?.items} collapsed={doneCollapsed} />
      </Section>
    </div>
  )
}

function SectionCards({
  items,
  collapsed,
}: {
  items: CaseSummary[] | undefined
  collapsed: boolean
}) {
  const all = items ?? []
  const visible = collapsed ? all.slice(0, COLLAPSED_VISIBLE) : all
  return (
    <div className={styles.grid}>
      {visible.map((item) => (
        <CaseCard key={item.id} item={item} />
      ))}
    </div>
  )
}

type SectionState = 'loading' | 'error' | 'empty' | 'ready'

function sectionState(query: {
  isPending: boolean
  isError: boolean
  data?: { items: unknown[] }
}): SectionState {
  if (query.isPending) return 'loading'
  if (query.isError) return 'error'
  if (!query.data || query.data.items.length === 0) return 'empty'
  return 'ready'
}

interface SectionProps {
  icon: LucideIcon
  title: string
  count?: number
  collapsed: boolean
  onToggle: () => void
  highlight?: 'requires-doctor'
  state: SectionState
  error: string
  onRetry: () => void
  empty: ReactNode
  footer?: ReactNode
  children: ReactNode
}

function Section({
  icon: SectionIcon,
  title,
  count,
  collapsed,
  onToggle,
  highlight,
  state,
  error,
  onRetry,
  empty,
  footer,
  children,
}: SectionProps) {
  const { t } = useTranslation('dashboard')
  const { t: tc } = useTranslation()
  const listId = useId()

  const headerInner = (
    <>
      <SectionIcon
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className={highlight ? styles.iconHighlight : styles.icon}
      />
      <span className={styles.sectionName}>{title}</span>
      {count != null && count > 0 && (
        <Badge status={highlight ?? 'neutral'}>{count}</Badge>
      )}
    </>
  )

  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          {state === 'ready' ? (
            <button
              type="button"
              className={styles.sectionToggle}
              aria-expanded={!collapsed}
              aria-controls={listId}
              aria-label={t(
                collapsed ? 'sections.expand' : 'sections.collapse',
                { name: title },
              )}
              onClick={onToggle}
            >
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                aria-hidden
                className={
                  collapsed ? styles.chevronCollapsed : styles.chevron
                }
              />
              {headerInner}
            </button>
          ) : (
            <span className={styles.sectionToggle}>{headerInner}</span>
          )}
        </h2>
        {footer != null && (
          <span className={styles.sectionFooter}>{footer}</span>
        )}
      </div>
      {state === 'loading' && (
        <div className={styles.grid}>
          <Skeleton height={116} />
          <Skeleton height={116} />
          <Skeleton height={116} />
        </div>
      )}
      {state === 'error' && (
        <Alert
          status="critical"
          actions={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              {tc('common.retry')}
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {state === 'empty' && empty}
      {state === 'ready' && <div id={listId}>{children}</div>}
    </section>
  )
}
