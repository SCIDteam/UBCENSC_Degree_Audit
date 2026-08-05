import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { AuditResult, CourseAllocationResult } from '../../types/audit'
import type { StoredCourseGrade, StoredCourseStatus } from '../../types/coursePlan'
import {
  BUCKET_STYLES,
  UNKNOWN_BUCKET_STYLE,
  findBucketStyleForAllocationBucket,
  humanizeUnknownBucket,
} from './auditBucketStyles'

const COURSE_STATUS_CONFIG: Record<StoredCourseStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'In progress', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  planned: { label: 'Planned', className: 'bg-muted text-muted-foreground border-border' },
}

const GRADE_LABELS: Record<StoredCourseGrade, string> = {
  P: 'Pass',
  F: 'Fail',
  W: 'Withdrawn',
  '': 'Not recorded',
}

interface ResolvedBucket {
  key: string
  label: string
  badgeClassName: string
  isExcluded: boolean
}

function resolveBucket(rawBucket: string): ResolvedBucket {
  const known = findBucketStyleForAllocationBucket(rawBucket)
  if (known) {
    return { key: known.key, label: known.label, badgeClassName: known.badgeClassName, isExcluded: known.key === 'excluded' }
  }
  return {
    key: rawBucket,
    label: humanizeUnknownBucket(rawBucket),
    badgeClassName: UNKNOWN_BUCKET_STYLE.badgeClassName,
    isExcluded: false,
  }
}

function humanizeMethod(method: string): string {
  const words = method.replace(/[_-]+/g, ' ').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

interface CourseAllocationTableProps {
  auditResult: AuditResult
}

export default function CourseAllocationTable({ auditResult }: CourseAllocationTableProps) {
  const [query, setQuery] = useState('')
  const [bucketFilter, setBucketFilter] = useState<string>('all')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  const rows = auditResult.course_allocations

  const resolvedRows = useMemo(
    () => rows.map((row) => ({ row, resolved: resolveBucket(row.bucket) })),
    [rows],
  )

  const bucketOptions = useMemo(() => {
    const knownOrder = BUCKET_STYLES.map((b) => ({ key: b.key, label: b.label }))
    const presentKnownKeys = new Set(resolvedRows.map((r) => r.resolved.key))
    const known = knownOrder.filter((b) => presentKnownKeys.has(b.key))
    const knownKeySet = new Set(BUCKET_STYLES.map((b) => b.key))
    const unknown = Array.from(
      new Map(
        resolvedRows
          .filter((r) => !knownKeySet.has(r.resolved.key as (typeof BUCKET_STYLES)[number]['key']))
          .map((r) => [r.resolved.key, r.resolved.label]),
      ),
    ).map(([key, label]) => ({ key, label }))
    return [...known, ...unknown]
  }, [resolvedRows])

  const summaryChips = useMemo(() => {
    const totals = new Map<string, { label: string; credits: number; isExcluded: boolean }>()
    resolvedRows.forEach(({ row, resolved }) => {
      const isExcludedRow = row.counted === false || resolved.isExcluded
      const key = isExcludedRow ? 'excluded' : resolved.key
      const label = isExcludedRow ? 'Excluded / Not Counted' : resolved.label
      const existing = totals.get(key)
      if (existing) {
        existing.credits += row.credits
      } else {
        totals.set(key, { label, credits: row.credits, isExcluded: isExcludedRow })
      }
    })
    const orderedKeys = [...BUCKET_STYLES.map((b) => b.key)]
    const known = orderedKeys.filter((k) => totals.has(k)).map((k) => ({ key: k, ...totals.get(k)! }))
    const unknown = Array.from(totals.entries())
      .filter(([k]) => !orderedKeys.includes(k as (typeof orderedKeys)[number]))
      .map(([key, value]) => ({ key, ...value }))
    return [...known, ...unknown]
  }, [resolvedRows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return resolvedRows.filter(({ row, resolved }) => {
      const matchesBucket = bucketFilter === 'all' || resolved.key === bucketFilter
      if (!matchesBucket) return false
      if (!q) return true
      const haystack = [row.course_code, resolved.label, row.exclusive_requirement_area, row.exclusive_label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [resolvedRows, query, bucketFilter])

  const countedCreditsShown = filteredRows.reduce((sum, { row }) => sum + (row.counted === true ? row.credits : 0), 0)
  const countedCreditsTotal = rows.reduce((sum, row) => sum + (row.counted === true ? row.credits : 0), 0)
  const excludedCreditsTotal = rows.reduce((sum, row) => sum + (row.counted === false ? row.credits : 0), 0)

  const hasActiveFilters = query.trim() !== '' || bucketFilter !== 'all'

  function clearFilters() {
    setQuery('')
    setBucketFilter('all')
  }

  function toggleExpanded(rowId: string) {
    setExpandedRowId((current) => (current === rowId ? null : rowId))
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {summaryChips.map((chip) => (
          <div
            key={chip.key}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
              chip.isExcluded ? 'border-orange-200 bg-orange-100 text-orange-700' : bucketBadgeToChipClass(chip.key)
            }`}
          >
            <span className="font-bold tabular-nums">{chip.credits}</span> cr &middot; {chip.label}
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="allocation-search" className="sr-only">
            Search by course or requirement
          </label>
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="allocation-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by course or requirement"
            className="w-full rounded-md border border-border bg-input-background py-1.5 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="allocation-bucket-filter" className="sr-only">
            Filter by bucket
          </label>
          <select
            id="allocation-bucket-filter"
            value={bucketFilter}
            onChange={(event) => setBucketFilter(event.target.value)}
            className="rounded-md border border-border bg-input-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All buckets</option>
            {bucketOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Course', 'Year', 'Credits', 'Status', 'Bucket', 'Counted', 'Details'].map((header) => (
                  <th
                    key={header}
                    className={`whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ${
                      header === 'Counted' ? 'hidden sm:table-cell' : ''
                    }`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No allocated courses match the current search and bucket filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ row, resolved }) => (
                  <AllocationRow
                    key={row.row_id}
                    row={row}
                    resolved={resolved}
                    expanded={expandedRowId === row.row_id}
                    onToggle={() => toggleExpanded(row.row_id)}
                  />
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-foreground">
                  {filteredRows.length} course{filteredRows.length !== 1 ? 's' : ''} shown
                </td>
                <td className="px-3 py-2 text-xs font-bold tabular-nums text-foreground">{countedCreditsShown} cr shown</td>
                <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground">
                  of {countedCreditsTotal} counted &middot; {excludedCreditsTotal} excluded
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

function bucketBadgeToChipClass(key: string): string {
  const style = BUCKET_STYLES.find((b) => b.key === key)
  return `${style ? style.badgeClassName : UNKNOWN_BUCKET_STYLE.badgeClassName} border-transparent`
}

interface AllocationRowProps {
  row: CourseAllocationResult
  resolved: ResolvedBucket
  expanded: boolean
  onToggle: () => void
}

function AllocationRow({ row, resolved, expanded, onToggle }: AllocationRowProps) {
  const isExcludedRow = row.counted === false || resolved.isExcluded
  const statusConfig = COURSE_STATUS_CONFIG[row.status]
  const detailsId = `allocation-details-${row.row_id}`

  const detailFields: { label: string; value: string }[] = []
  if (row.grade) detailFields.push({ label: 'Grade', value: GRADE_LABELS[row.grade] })
  if (row.percentage !== null && row.percentage !== undefined) detailFields.push({ label: 'Percentage', value: `${row.percentage}%` })
  if (row.allocation_method) detailFields.push({ label: 'Allocation method', value: humanizeMethod(row.allocation_method) })
  if (row.allocation_notes) detailFields.push({ label: 'Allocation notes', value: row.allocation_notes })
  if (row.exclusive_requirement_area) detailFields.push({ label: 'Requirement area', value: row.exclusive_requirement_area })
  if (row.exclusive_label) detailFields.push({ label: 'Requirement label', value: row.exclusive_label })
  if (row.exclusive_group_id) detailFields.push({ label: 'Exclusive group ID', value: row.exclusive_group_id })
  if (row.double_count_allowed !== undefined) {
    detailFields.push({ label: 'Double counting', value: row.double_count_allowed ? 'Allowed' : 'Not allowed' })
  }

  return (
    <>
      <tr className={isExcludedRow ? 'bg-muted/30' : undefined}>
        <td className={`whitespace-nowrap px-3 py-2.5 font-semibold ${isExcludedRow ? 'text-muted-foreground' : 'text-foreground'}`}>
          {row.course_code}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">Year {row.year_taken}</td>
        <td className="px-3 py-2.5 tabular-nums text-foreground">{row.credits} cr</td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusConfig.className}`}>
            {statusConfig.label}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center rounded border border-transparent px-1.5 py-0.5 text-[10px] font-medium ${resolved.badgeClassName}`}>
            {resolved.label}
          </span>
        </td>
        <td className="hidden px-3 py-2.5 sm:table-cell">
          <CountedIndicator counted={row.counted} />
        </td>
        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? 'Hide details' : 'View details'}
            <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr id={detailsId}>
          <td colSpan={7} className={`px-3 py-3 ${isExcludedRow ? 'bg-muted/30' : 'bg-muted/10'}`}>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              <div className="sm:hidden">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Counted</dt>
                <dd className="text-xs text-foreground">
                  <CountedIndicator counted={row.counted} />
                </dd>
              </div>
              {detailFields.map((field) => (
                <div key={field.label}>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.label}</dt>
                  <dd className="text-xs text-foreground">{field.value}</dd>
                </div>
              ))}
              {row.also_counts_toward && row.also_counts_toward.length > 0 ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Also counts toward</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {row.also_counts_toward.map((area) => (
                      <span key={area} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                        {area}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {row.double_count_groups && row.double_count_groups.length > 0 ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Double-count groups</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {row.double_count_groups.map((group) => (
                      <span key={group} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                        {group}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Attempt ID</dt>
                <dd className="text-[10px] text-muted-foreground/70">{row.attempt_id}</dd>
              </div>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  )
}

function CountedIndicator({ counted }: { counted?: boolean }) {
  if (counted === true) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <Check size={13} aria-hidden="true" />
        Counted
      </span>
    )
  }
  if (counted === false) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <X size={13} aria-hidden="true" />
        Not counted
      </span>
    )
  }
  return <span className="text-muted-foreground">Not specified</span>
}
