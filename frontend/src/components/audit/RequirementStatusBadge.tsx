import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react'
import type { AuditRequirementStatus } from '../../types/audit'

const STATUS_CONFIG: Record<
  AuditRequirementStatus,
  { label: string; icon: typeof CheckCircle2; className: string; cardBorderClassName: string }
> = {
  satisfied: {
    label: 'Satisfied',
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    cardBorderClassName: 'border-emerald-200',
  },
  partial: {
    label: 'Partial',
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    cardBorderClassName: 'border-amber-200',
  },
  missing: {
    label: 'Missing',
    icon: XCircle,
    className: 'border-red-200 bg-red-50 text-destructive',
    cardBorderClassName: 'border-red-200',
  },
  not_applicable: {
    label: 'Not applicable',
    icon: MinusCircle,
    className: 'border-border bg-muted text-muted-foreground',
    cardBorderClassName: 'border-border',
  },
}

// Full-card border color so a card's status reads at a glance without a
// saturated background; text/icon labeling still carries the actual meaning.
export function getStatusCardBorderClass(status: AuditRequirementStatus): string {
  return STATUS_CONFIG[status].cardBorderClassName
}

interface RequirementStatusBadgeProps {
  status: AuditRequirementStatus
}

export default function RequirementStatusBadge({ status }: RequirementStatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      <Icon size={12} aria-hidden="true" />
      {config.label}
    </span>
  )
}
