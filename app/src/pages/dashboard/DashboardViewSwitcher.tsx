import { useTranslation } from 'react-i18next'
import { Icon, SegmentedControl } from '@/foundation/ui'
import {
  DASHBOARD_VIEW_REGISTRY,
  type DashboardViewId,
} from './DashboardViewRegistry'
import styles from './DashboardViewSwitcher.module.css'

interface DashboardViewSwitcherProps {
  value: DashboardViewId
  onValueChange: (view: DashboardViewId) => void
}

/** Независимый блок переключения главного экрана. */
export function DashboardViewSwitcher({
  value,
  onValueChange,
}: DashboardViewSwitcherProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className={styles.root}>
      <span className={styles.label}>{t('views.label')}</span>
      <SegmentedControl
        value={value}
        onValueChange={(next) => onValueChange(next as DashboardViewId)}
        aria-label={t('views.label')}
        options={DASHBOARD_VIEW_REGISTRY.map((view) => ({
          value: view.id,
          label: (
            <span className={styles.option}>
              <Icon icon={view.icon} size={15} />
              <span>{t(view.labelKey)}</span>
            </span>
          ),
        }))}
      />
    </div>
  )
}
