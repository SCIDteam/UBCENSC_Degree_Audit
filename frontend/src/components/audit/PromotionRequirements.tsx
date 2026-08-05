import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import type { AuditProgressUnit, AuditResult, PromotionRequirementResult } from '../../types/audit'
import RequirementStatusBadge from './RequirementStatusBadge'

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(2)))
}

function pluralizeUnit(count: number, unit: AuditProgressUnit): string {
  if (unit === 'credits') return count === 1 ? 'credit' : 'credits'
  if (unit === 'categories') return count === 1 ? 'category' : 'categories'
  return count === 1 ? 'course' : 'courses'
}

function formatProgress(requirement: PromotionRequirementResult): string {
  const { completed, required, unit } = requirement
  return `${formatNumber(completed)} / ${formatNumber(required)} ${pluralizeUnit(required, unit)}`
}

function formatSecondaryLine(requirement: PromotionRequirementResult): string | null {
  const { remaining, surplus, unit } = requirement
  if (remaining > 0) return `${formatNumber(remaining)} ${pluralizeUnit(remaining, unit)} remaining`
  if (surplus > 0) return `${formatNumber(surplus)} ${pluralizeUnit(surplus, unit)} above requirement`
  return null
}

const STATUS_DOT_CLASS: Record<PromotionRequirementResult['status'], string> = {
  satisfied: 'bg-emerald-500',
  partial: 'bg-amber-500',
  missing: 'bg-red-500',
  not_applicable: 'bg-muted-foreground/40',
}

function PromotionRequirementRow({ requirement }: { requirement: PromotionRequirementResult }) {
  const [expanded, setExpanded] = useState(false)
  const { rule_id, label, status, matched_courses, notes, remaining, surplus } = requirement
  const secondaryLine = formatSecondaryLine(requirement)
  const listId = `promotion-matched-courses-${rule_id}`

  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`} aria-hidden="true" />
        <span className="flex-1 text-[13px] text-foreground">{label}</span>
        <span className="font-heading text-[13px] font-semibold tabular-nums text-foreground sm:w-32 sm:text-right">
          {formatProgress(requirement)}
        </span>
        {secondaryLine && (
          <span className="text-[11px] text-muted-foreground sm:w-40 sm:text-right">{secondaryLine}</span>
        )}
        <RequirementStatusBadge status={status} />
      </div>

      <div className="mt-1.5 pl-4 sm:pl-5">
        {matched_courses.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No matched courses</div>
        ) : (
          <>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {expanded ? 'Hide' : 'View'} {matched_courses.length} matched{' '}
              {matched_courses.length === 1 ? 'course' : 'courses'}
              <ChevronDown
                size={13}
                aria-hidden="true"
                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
            {expanded && (
              <div id={listId} className="mt-1.5 space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {matched_courses.map((courseCode, index) => (
                    <span
                      key={`${courseCode}-${index}`}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                    >
                      {courseCode}
                    </span>
                  ))}
                </div>
                {notes && <p className="text-[10.5px] leading-snug text-muted-foreground">{notes}</p>}
                {remaining > 0 && (
                  <p className="text-[10.5px] text-muted-foreground">
                    {formatNumber(remaining)} {pluralizeUnit(remaining, requirement.unit)} remaining
                  </p>
                )}
                {surplus > 0 && (
                  <p className="text-[10.5px] text-muted-foreground">
                    {formatNumber(surplus)} {pluralizeUnit(surplus, requirement.unit)} above requirement
                  </p>
                )}
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{rule_id}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface PromotionGroup {
  promotion_to: string
  rows: PromotionRequirementResult[]
}

function groupPromotionRequirements(requirements: PromotionRequirementResult[]): PromotionGroup[] {
  const groups = new Map<string, PromotionRequirementResult[]>()
  for (const requirement of requirements) {
    const existing = groups.get(requirement.promotion_to)
    if (existing) {
      existing.push(requirement)
    } else {
      groups.set(requirement.promotion_to, [requirement])
    }
  }

  const numeric: PromotionGroup[] = []
  const nonNumeric: PromotionGroup[] = []
  for (const [promotion_to, rows] of groups) {
    const group = { promotion_to, rows }
    if (/^\d+$/.test(promotion_to)) {
      numeric.push(group)
    } else {
      nonNumeric.push(group)
    }
  }
  numeric.sort((a, b) => Number(a.promotion_to) - Number(b.promotion_to))

  return [...numeric, ...nonNumeric]
}

function PromotionGroupCard({ group }: { group: PromotionGroup }) {
  const { promotion_to, rows } = group
  const satisfied = rows.filter((r) => r.status === 'satisfied').length
  const partial = rows.filter((r) => r.status === 'partial').length
  const missing = rows.filter((r) => r.status === 'missing').length
  const heading = /^\d+$/.test(promotion_to) ? `Promotion to Year ${promotion_to}` : `Promotion to ${promotion_to}`

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-sky-50 px-4 py-2.5">
        <h3 className="font-heading text-[13px] font-semibold text-foreground">{heading}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {satisfied} / {rows.length} satisfied
          </span>
          {partial > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {partial} partial
            </span>
          )}
          {missing > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-destructive">
              {missing} missing
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {rows.map((requirement) => (
          <PromotionRequirementRow key={requirement.rule_id} requirement={requirement} />
        ))}
      </div>
    </div>
  )
}

interface PromotionRequirementsProps {
  auditResult: AuditResult
}

export default function PromotionRequirements({ auditResult }: PromotionRequirementsProps) {
  const { promotion_requirements, case_summary } = auditResult
  const { calendar_year, promotion } = case_summary

  const satisfied = promotion_requirements.filter((r) => r.status === 'satisfied').length
  const partial = promotion_requirements.filter((r) => r.status === 'partial').length
  const missing = promotion_requirements.filter((r) => r.status === 'missing').length
  const notApplicable = promotion_requirements.filter((r) => r.status === 'not_applicable').length

  const groups = groupPromotionRequirements(promotion_requirements)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Promotion Status</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {satisfied} / {promotion_requirements.length} satisfied
          </span>
          {partial > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {partial} partial
            </span>
          )}
          {missing > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-destructive">
              {missing} missing
            </span>
          )}
          {notApplicable > 0 && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {notApplicable} not applicable
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-2.5">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-600" aria-hidden="true" />
        <div>
          <p className="text-[13px] font-semibold text-blue-900">{promotion.message}</p>
          <p className="mt-1 text-[11px] leading-snug text-blue-700">
            This prototype does not confirm eligibility to graduate. Review degree requirements and graduation
            decisions with an academic advisor.
          </p>
        </div>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Promotion Conditions · {calendar_year} Calendar
      </p>

      <div className="space-y-3">
        {groups.map((group) => (
          <PromotionGroupCard key={group.promotion_to} group={group} />
        ))}
      </div>
    </div>
  )
}
