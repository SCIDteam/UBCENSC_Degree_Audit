import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AuditProgressUnit, AuditRequirementStatus, AuditResult, FacultyRequirementResult } from '../../types/audit'
import RequirementStatusBadge from './RequirementStatusBadge'
import { getStatusCardBorderClass } from './auditStatusStyles'

// Tim's Faculty audit treats this requirement as a maximum, not a deficiency,
// so it gets "used / Maximum / remaining under limit" wording instead of the
// usual "completed / Required / above minimum" wording.
const OTHER_FACULTY_CREDITS_CAP_ID = 'OTHER_FACULTY_CREDITS_CAP'

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(2)))
}

function pluralizeUnit(count: number, unit: AuditProgressUnit): string {
  if (unit === 'credits') return count === 1 ? 'credit' : 'credits'
  if (unit === 'categories') return count === 1 ? 'category' : 'categories'
  return count === 1 ? 'course' : 'courses'
}

function formatPrimaryMetric(requirement: FacultyRequirementResult, isCap: boolean): string {
  const { completed, required, unit } = requirement
  if (isCap) {
    return `${formatNumber(completed)} of ${formatNumber(required)} ${pluralizeUnit(required, unit)} used`
  }
  if (unit === 'credits') {
    return `${formatNumber(completed)} ${pluralizeUnit(completed, unit)}`
  }
  return `${formatNumber(completed)} of ${formatNumber(required)} ${pluralizeUnit(completed, unit)}`
}

function formatThreshold(requirement: FacultyRequirementResult, isCap: boolean): string {
  const { required, unit } = requirement
  const thresholdLabel = isCap ? 'Maximum' : 'Required'
  return `${thresholdLabel}: ${formatNumber(required)} ${pluralizeUnit(required, unit)}`
}

function getProgressBarClass(status: AuditRequirementStatus, isCap: boolean): string {
  if (isCap) return 'bg-sky-500'

  switch (status) {
    case 'satisfied':
      return 'bg-emerald-500'
    case 'partial':
      return 'bg-amber-500'
    case 'missing':
      return 'bg-red-500'
    case 'not_applicable':
      return 'bg-muted-foreground/30'
  }
}

function formatSummaryLine(requirement: FacultyRequirementResult, isCap: boolean): string | null {
  const { remaining, surplus, unit } = requirement
  if (isCap && remaining > 0) {
    return `${formatNumber(remaining)} ${pluralizeUnit(remaining, unit)} remaining under limit`
  }
  if (surplus > 0) {
    return `${formatNumber(surplus)} ${pluralizeUnit(surplus, unit)} above minimum`
  }
  if (remaining > 0) {
    return `${formatNumber(remaining)} ${pluralizeUnit(remaining, unit)} remaining`
  }
  return null
}

function FacultyRequirementCard({ requirement }: { requirement: FacultyRequirementResult }) {
  const [expanded, setExpanded] = useState(false)
  const { requirement_id, label, status, required, completed, matched_courses, notes } = requirement

  const isCap = requirement_id === OTHER_FACULTY_CREDITS_CAP_ID
  const ratio = required > 0 ? Math.min(completed / required, 1) : 0
  const showProgress = status !== 'not_applicable'
  const summaryLine = formatSummaryLine(requirement, isCap)
  const listId = `faculty-matched-courses-${requirement_id}`

  return (
    <div
      className={`flex flex-col rounded-lg border bg-card p-2.5 shadow-card ${getStatusCardBorderClass(status)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading text-[13px] font-semibold leading-tight text-foreground">{label}</h3>
        <RequirementStatusBadge status={status} />
      </div>

      <div className="mt-1.5 font-heading text-base font-semibold text-foreground">
        {formatPrimaryMetric(requirement, isCap)}
      </div>
      <div className="text-[11px] text-muted-foreground">{formatThreshold(requirement, isCap)}</div>

      {showProgress && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={required}
          aria-valuenow={Math.min(completed, required)}
          aria-label={`${label} progress`}
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={`h-full rounded-full ${getProgressBarClass(status, isCap)}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}

      {summaryLine && <div className="mt-1 text-[11px] text-muted-foreground">{summaryLine}</div>}

      {notes && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          {notes}
        </p>
      )}

      <div className="mt-1.5">
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
              <div id={listId} className="mt-1.5 flex flex-wrap gap-1.5">
                {matched_courses.map((courseCode, index) => (
                  <span
                    key={`${courseCode}-${index}`}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                  >
                    {courseCode}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-1.5 text-[9px] uppercase tracking-wide text-muted-foreground/60">
        {requirement_id}
      </div>
    </div>
  )
}

interface FacultyRequirementsProps {
  auditResult: AuditResult
}

export default function FacultyRequirements({ auditResult }: FacultyRequirementsProps) {
  const { faculty_requirements, case_summary } = auditResult
  const { faculty } = case_summary

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Faculty Requirements</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {faculty.satisfied} / {faculty.total} satisfied
          </span>
          {faculty.partial > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {faculty.partial} partial
            </span>
          )}
          {faculty.missing > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-destructive">
              {faculty.missing} missing
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {faculty_requirements.map((requirement) => (
          <FacultyRequirementCard key={requirement.requirement_id} requirement={requirement} />
        ))}
      </div>
    </div>
  )
}
