import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react'
import type { AuditRequirementStatus } from '../../types/audit'

export interface AuditStatusStyle {
    label: string
    icon: LucideIcon
    badgeClassName: string
    cardBorderClassName: string
}

export const AUDIT_STATUS_STYLES: Record<AuditRequirementStatus, AuditStatusStyle> = {
    satisfied: {
        label: 'Satisfied',
        icon: CheckCircle2,
        badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        cardBorderClassName: 'border-emerald-200',
    },
    partial: {
        label: 'Partial',
        icon: AlertTriangle,
        badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
        cardBorderClassName: 'border-amber-200',
    },
    missing: {
        label: 'Missing',
        icon: XCircle,
        badgeClassName: 'border-red-200 bg-red-50 text-destructive',
        cardBorderClassName: 'border-red-200',
    },
    not_applicable: {
        label: 'Not applicable',
        icon: MinusCircle,
        badgeClassName: 'border-border bg-muted text-muted-foreground',
        cardBorderClassName: 'border-border',
    },
}

export function getStatusCardBorderClass(status: AuditRequirementStatus): string {
    return AUDIT_STATUS_STYLES[status].cardBorderClassName
}