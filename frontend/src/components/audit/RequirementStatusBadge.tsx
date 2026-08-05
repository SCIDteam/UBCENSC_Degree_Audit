import type { AuditRequirementStatus } from '../../types/audit'
import { AUDIT_STATUS_STYLES } from './auditStatusStyles'

interface RequirementStatusBadgeProps {
  status: AuditRequirementStatus
}

export default function RequirementStatusBadge({
  status,
}: RequirementStatusBadgeProps) {
  const config = AUDIT_STATUS_STYLES[status]
  const Icon = config.icon

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.badgeClassName}`}
    >
      <Icon size={12} aria-hidden="true" />
      {config.label}
    </span>
  )
}