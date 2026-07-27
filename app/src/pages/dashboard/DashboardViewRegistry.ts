import { Columns3, LayoutDashboard, type LucideIcon } from 'lucide-react'

export type DashboardViewId = 'general-light' | 'kanban'

export interface DashboardViewDefinition {
  id: DashboardViewId
  labelKey: 'views.generalLight' | 'views.kanban'
  icon: LucideIcon
}

/**
 * Единственный реестр главных экранов DaatMed.
 * Новый вариант добавляется отдельным модулем и одной записью здесь.
 */
export const DASHBOARD_VIEW_REGISTRY: readonly DashboardViewDefinition[] = [
  {
    id: 'general-light',
    labelKey: 'views.generalLight',
    icon: LayoutDashboard,
  },
  {
    id: 'kanban',
    labelKey: 'views.kanban',
    icon: Columns3,
  },
]
