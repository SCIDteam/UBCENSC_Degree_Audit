import { useState } from 'react'
import type { AuditProgressUnit, AuditResult, FacultyRequirementResult } from '../../types/audit'
import RequirementStatusBadge from './RequirementStatusBadge'

// Tim's Faculty audit treats this requirement as a maximum, not a deficiency,
// so its "remaining" value is displayed as spare capacity rather than a gap.
const OTHER_FACULTY_CREDITS_CAP_ID = 'OTHER_FACULTY_CREDITS_CAP'

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(2)))
}

function pluralizeUnit(count: number, unit: AuditProgressUnit): string {
  if (unit === 'credits') return count === 1 ? 'credit' : 'credits'
  if (unit === 'categories') return count === 1 ? 'category' : 'categories'
  return count === 1 ? 'course' : 'courses'
}

function formatProgressLabel(completed: number, required: number, unit: AuditProgressUnit): string {
  return `${formatNumber(completed)} of ${formatNumber(required)} ${pluralizeUnit(completed, unit)}`
}

function FacultyRequirementCard({ requirement }: { requirement: FacultyRequirementResult }) {
  const [expanded, setExpanded] = useState(false)
  const {
    requirement_id,
    label,
    status,
    completed,
    required,
    remaining,
    surplus,
    unit,
    matched_courses,
    notes,
  } = requirement

  const isCapRequirement = requirement_id === OTHER_FACULTY_CREDITS_CAP_ID
  const ratio = required > 0 ? Math.min(completed / required, 1) : 0
  const showProgress = status !== 'not_applicable'
  const listId = `faculty-matched-courses-${requirement_id}`

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold text-foreground">{label}</h3>
          <div className="text-[10px] text-muted-foreground">{requirement_id}</div>
        </div>
        <RequirementStatusBadge status={status} />
      </div>

      {showProgress && (
        <div className="mt-2.5">
          <div className="text-[11px] text-muted-foreground">
            {formatProgressLabel(completed, required, unit)}
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={required}
            aria-valuenow={Math.min(completed, required)}
            aria-label={`${label} progress`}
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
          </div>
        </div>
      )}

      {(remaining > 0 || surplus > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {remaining > 0 && (
            <span>
              {isCapRequirement ? 'Remaining capacity' : 'Remaining'}: {formatNumber(remaining)}{' '}
              {pluralizeUnit(remaining, unit)}
            </span>
          )}
          {surplus > 0 && (
            <span>
              Surplus: {formatNumber(surplus)} {pluralizeUnit(surplus, unit)}
            </span>
          )}
        </div>
      )}

      {notes && (
        <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
          {notes}
        </p>
      )}

      <div className="mt-2.5">
        {matched_courses.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No matched courses</div>
        ) : (
          <>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded px-0.5 text-[11px] font-medium text-primary transition-colors hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {expanded ? 'Hide' : 'View'} {matched_courses.length} matched{' '}
              {matched_courses.length === 1 ? 'course' : 'courses'}
            </button>
            {expanded && (
              <div id={listId} className="mt-2 flex flex-wrap gap-1.5">
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
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="font-heading text-xs font-semibold text-foreground">Faculty Requirements</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{faculty.satisfied}</span> of{' '}
            <span className="font-medium text-foreground">{faculty.total}</span> satisfied
          </span>
          {faculty.partial > 0 && (
            <span>
              <span className="font-medium text-foreground">{faculty.partial}</span> partial
            </span>
          )}
          {faculty.missing > 0 && (
            <span>
              <span className="font-medium text-foreground">{faculty.missing}</span> missing
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {faculty_requirements.map((requirement) => (
          <FacultyRequirementCard key={requirement.requirement_id} requirement={requirement} />
        ))}
      </div>
    </div>
  )
}
