import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AuditProgressUnit, AuditResult, SpecializationRequirementResult } from '../../types/audit'
import RequirementStatusBadge from './RequirementStatusBadge'
import { BUCKET_STYLES, UNKNOWN_BUCKET_STYLE, findBucketStyleForRequirementArea } from './auditBucketStyles'

const AGGREGATE_RULE_TYPES = new Set(['option_total_credits', 'tools_elective_total'])

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(2)))
}

function pluralizeUnit(count: number, unit: AuditProgressUnit): string {
  if (unit === 'credits') return count === 1 ? 'credit' : 'credits'
  if (unit === 'categories') return count === 1 ? 'category' : 'categories'
  return count === 1 ? 'course' : 'courses'
}

function formatProgress(requirement: SpecializationRequirementResult): string {
  const { completed, required, unit } = requirement
  return `${formatNumber(completed)} of ${formatNumber(required)} ${pluralizeUnit(required, unit)}`
}

// Row identifiers are long, generated group keys (e.g.
// "ENSC_2024_2025_MAJOR_AOC_ECOLOGY_CONSERVATION_001"). Only surface the
// trailing segment as a compact identifier when it reads as a short index;
// the full id is still available in the expanded detail as subdued metadata.
function shortGroupId(groupId: string): string | null {
  const segments = groupId.split('_')
  const last = segments[segments.length - 1]
  return /^[A-Za-z0-9]{1,4}$/.test(last) ? last : null
}

function aggregateSecondaryLabel(ruleType: string): string | null {
  if (ruleType === 'option_total_credits' || ruleType === 'tools_elective_total') return 'Total'
  return null
}

interface SpecializationRequirementRowProps {
  requirement: SpecializationRequirementResult
  showOptionName: boolean
}

function SpecializationRequirementRow({ requirement, showOptionName }: SpecializationRequirementRowProps) {
  const [expanded, setExpanded] = useState(false)
  const {
    group_id,
    label,
    status,
    remaining,
    surplus,
    unit,
    allocated_courses,
    allocation_notes,
    theme,
    option_name,
    rule_type,
  } = requirement

  const hasDetail =
    allocated_courses.length > 0 ||
    !!allocation_notes ||
    !!theme ||
    (showOptionName && !!option_name) ||
    remaining > 0 ||
    surplus > 0

  const isAggregate = AGGREGATE_RULE_TYPES.has(rule_type)
  const secondaryLabel = isAggregate ? aggregateSecondaryLabel(rule_type) : null
  const shortId = shortGroupId(group_id)
  const detailId = `spec-requirement-detail-${group_id}`

  return (
    <div className={`border-b border-border last:border-0 ${isAggregate ? 'bg-muted/30' : ''}`}>
      <button
        type="button"
        disabled={!hasDetail}
        aria-expanded={hasDetail ? expanded : undefined}
        aria-controls={hasDetail ? detailId : undefined}
        onClick={() => hasDetail && setExpanded((prev) => !prev)}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
          hasDetail ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'
        }`}
      >
        {shortId && (
          <span className="hidden w-9 flex-shrink-0 font-mono text-[10px] text-muted-foreground/70 sm:block">
            {shortId}
          </span>
        )}
        <span
          className={`min-w-[10rem] flex-1 basis-full text-[13px] leading-snug text-foreground sm:basis-0 ${
            isAggregate ? 'font-semibold' : ''
          }`}
        >
          {label}
          {secondaryLabel && (
            <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
              {secondaryLabel}
            </span>
          )}
        </span>
        <RequirementStatusBadge status={status} />
        <span className="w-32 flex-shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {formatProgress(requirement)}
        </span>
        {hasDetail && (
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={`flex-shrink-0 text-muted-foreground transition-transform duration-150 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {hasDetail && expanded && (
        <div id={detailId} className="px-3 pb-3 pt-0 sm:pl-12">
          <div className="rounded-md border border-border bg-background p-2.5 text-[11px] text-foreground/80">
            {showOptionName && option_name && (
              <p className="text-[11px] text-foreground">
                Option: <span className="font-medium">{option_name}</span>
              </p>
            )}
            {theme && <p className="mt-1 text-[11px] text-foreground">Theme: {theme}</p>}

            {allocated_courses.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">Allocated courses:</span>
                {allocated_courses.map((courseCode, index) => (
                  <span
                    key={`${courseCode}-${index}`}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                  >
                    {courseCode}
                  </span>
                ))}
              </div>
            )}

            {allocation_notes && <p className="mt-1.5 leading-relaxed">{allocation_notes}</p>}

            {remaining > 0 && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                Remaining: {formatNumber(remaining)} {pluralizeUnit(remaining, unit)}
              </p>
            )}
            {surplus > 0 && (
              <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                Surplus: {formatNumber(surplus)} {pluralizeUnit(surplus, unit)}
              </p>
            )}

            <p className="mt-1.5 border-t border-border pt-1.5 text-[9px] uppercase tracking-wide text-muted-foreground/60">
              {group_id}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

interface SpecializationGroupCardProps {
  groupKey: string
  label: string
  headerBgClassName: string
  headerTextClassName: string
  accentClassName: string
  requirements: SpecializationRequirementResult[]
}

function SpecializationGroupCard({
  label,
  headerBgClassName,
  headerTextClassName,
  accentClassName,
  requirements,
}: SpecializationGroupCardProps) {
  const total = requirements.length
  const satisfied = requirements.filter((requirement) => requirement.status === 'satisfied').length
  const partial = requirements.filter((requirement) => requirement.status === 'partial').length
  const missing = requirements.filter((requirement) => requirement.status === 'missing').length

  const optionNames = Array.from(
    new Set(requirements.map((requirement) => requirement.option_name).filter((name): name is string => !!name)),
  )
  const showOptionNameInHeader = optionNames.length === 1
  const showOptionNamePerRow = optionNames.length > 1

  return (
    <div className={`overflow-hidden rounded-xl border bg-card shadow-card ${accentClassName}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 ${headerBgClassName}`}>
        <div>
          <h4 className={`text-xs font-bold uppercase tracking-wider ${headerTextClassName}`}>{label}</h4>
          {showOptionNameInHeader && (
            <p className="mt-0.5 text-[11px] font-medium text-foreground">{optionNames[0]}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {satisfied} / {total}
          </span>
          {partial > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {partial} partial
            </span>
          )}
          {missing > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              {missing} missing
            </span>
          )}
        </div>
      </div>
      <div>
        {requirements.map((requirement) => (
          <SpecializationRequirementRow
            key={requirement.group_id}
            requirement={requirement}
            showOptionName={showOptionNamePerRow}
          />
        ))}
      </div>
    </div>
  )
}

interface SpecializationRequirementsProps {
  auditResult: AuditResult
}

export default function SpecializationRequirements({ auditResult }: SpecializationRequirementsProps) {
  const { specialization_requirements, case_summary } = auditResult
  const { specialization } = case_summary

  const groupedByArea = new Map<string, SpecializationRequirementResult[]>()
  for (const requirement of specialization_requirements) {
    const existing = groupedByArea.get(requirement.requirement_area)
    if (existing) {
      existing.push(requirement)
    } else {
      groupedByArea.set(requirement.requirement_area, [requirement])
    }
  }

  const knownGroups = BUCKET_STYLES.filter((bucket) =>
    bucket.requirementAreaAliases.some((alias) => groupedByArea.has(alias)),
  ).map((bucket) => {
    const area = bucket.requirementAreaAliases.find((alias) => groupedByArea.has(alias))!
    return {
      key: bucket.key,
      label: bucket.label,
      headerBgClassName: bucket.headerBgClassName,
      headerTextClassName: bucket.headerTextClassName,
      accentClassName: bucket.accentClassName,
      requirements: groupedByArea.get(area)!,
    }
  })

  const knownAreas = new Set(knownGroups.flatMap((group) => BUCKET_STYLES.find((b) => b.key === group.key)!.requirementAreaAliases))
  const unknownAreasInSourceOrder = Array.from(new Set(specialization_requirements.map((r) => r.requirement_area))).filter(
    (area) => !knownAreas.has(area) && !findBucketStyleForRequirementArea(area),
  )
  const unknownGroups = unknownAreasInSourceOrder.map((area) => ({
    key: area,
    label: area,
    headerBgClassName: UNKNOWN_BUCKET_STYLE.headerBgClassName,
    headerTextClassName: UNKNOWN_BUCKET_STYLE.headerTextClassName,
    accentClassName: UNKNOWN_BUCKET_STYLE.accentClassName,
    requirements: groupedByArea.get(area)!,
  }))

  const groups = [...knownGroups, ...unknownGroups]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Specialization Requirements</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {specialization.satisfied} / {specialization.total} satisfied
          </span>
          {specialization.partial > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {specialization.partial} partial
            </span>
          )}
          {specialization.missing > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-destructive">
              {specialization.missing} missing
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <SpecializationGroupCard
            key={group.key}
            groupKey={group.key}
            label={group.label}
            headerBgClassName={group.headerBgClassName}
            headerTextClassName={group.headerTextClassName}
            accentClassName={group.accentClassName}
            requirements={group.requirements}
          />
        ))}
      </div>
    </div>
  )
}
