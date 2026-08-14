import type { CourseAttempt, PlannerTerm } from '../types/coursePlan'
import type { AllocationConfigRule, AllocationConfigs } from '../types/auditRules'
import type { SpecializationAuditRow } from './specializationAuditor'
import type { SpecializationRequirementResolver } from './specializationRequirementResolver'

// ---------------------------------------------------------------------------
// AllocationWorkingRow
// ---------------------------------------------------------------------------
export interface AllocationWorkingRow {
    // Original attempt identity
    attempt: CourseAttempt
    attempt_id: string
    course_code: string
    // Working course identifier for later eligibility matching. Equal to
    // course_code until effective_course_code exists on CourseAttempt.
    working_course_code: string

    counted: boolean

    // Exclusive bucket assignment fields (populated by later slices)
    exclusive_requirement_area: string
    exclusive_group_id: string
    exclusive_label: string
    exclusive_rule_type: string
    exclusive_bucket: string
    allocation_priority: number | null
    allocation_method: string
    allocation_notes: string

    // Override / double-count fields (initialized neutral; no override
    // behavior implemented in this slice)
    override_used: boolean
    double_count_allowed: boolean
    double_count_groups: string[]
    also_counts_toward: string[]

    // Internal deterministic candidate-sort metadata
    status_sort_priority: number
    original_order: number
    sortable_term_key: number
}

const NOT_COUNTED_ALLOCATION_METHOD = 'not_counted_status'
const NOT_COUNTED_ALLOCATION_NOTES =
    'Course excluded because status, letter grade, or percentage grade is not countable.'

// Matches Tim's _is_counted_row / _counted_course_mask, and the existing
// frontend convention in specializationAuditor.ts / runAudit.ts
// (filterCountedCourses): planned and in_progress always count; completed
// only counts with grade 'P'. completed + F and completed + W do not count.
// CourseAttempt's percentage field is not used here: no percentage-based
// failure semantics exist in the current frontend model (unlike Tim's
// percentage < 50 check), so none are invented.
function isCountedAttempt(attempt: CourseAttempt): boolean {
    return (
        attempt.status === 'planned' ||
        attempt.status === 'in_progress' ||
        (attempt.status === 'completed' && attempt.grade === 'P')
    )
}

// Matches Tim's _add_allocation_sort_columns status priority map.
function statusSortPriority(status: CourseAttempt['status']): number {
    switch (status) {
        case 'completed':
            return 0
        case 'in_progress':
            return 1
        case 'planned':
            return 2
        default:
            return 9
    }
}

const TERM_ORDINAL: Record<PlannerTerm, number> = {
    winter_1: 0,
    winter_2: 1,
    summer: 2,
}

// See "KNOWN LIMITATIONS" (2) above: a neutral, calendar-agnostic stand-in
// for Tim's absolute term string, sortable ascending within one student plan.
function computeSortableTermKey(attempt: CourseAttempt): number {
    return attempt.year_taken * 10 + TERM_ORDINAL[attempt.term_taken]
}

// ---------------------------------------------------------------------------
// Row preparation
// ---------------------------------------------------------------------------
//
// Mirrors the beginning of Tim's allocate(): copy every course, ensure
// allocation columns exist, mark non-counted rows with allocation_method /
// allocation_notes, and attach deterministic sort metadata. Every input
// attempt produces exactly one output row, including non-counted
// (failed/withdrawn) attempts, which are preserved rather than filtered out.
//
// Does NOT sort the returned array; original input order is preserved via
// original_order for later deterministic candidate-subset sorting.
export function prepareAllocationRows(
    student_course_plan: CourseAttempt[]
): AllocationWorkingRow[] {
    return student_course_plan.map((attempt, index) => {
        const counted = isCountedAttempt(attempt)

        return {
            attempt,
            attempt_id: attempt.attempt_id,
            course_code: attempt.course_code,
            working_course_code: attempt.course_code,
            counted,

            exclusive_requirement_area: '',
            exclusive_group_id: '',
            exclusive_label: '',
            exclusive_rule_type: '',
            exclusive_bucket: '',
            allocation_priority: null,
            allocation_method: counted ? '' : NOT_COUNTED_ALLOCATION_METHOD,
            allocation_notes: counted ? '' : NOT_COUNTED_ALLOCATION_NOTES,

            override_used: false,
            double_count_allowed: false,
            double_count_groups: [],
            also_counts_toward: [],

            status_sort_priority: statusSortPriority(attempt.status),
            original_order: index,
            sortable_term_key: computeSortableTermKey(attempt),
        }
    })
}

// ---------------------------------------------------------------------------
// Candidate selection helpers
// ---------------------------------------------------------------------------
//
// Equivalent to Tim's _select_indices_by_count / _select_indices_by_credits.
// These perform NO eligibility matching: callers must already have narrowed
// candidates down to an eligible, unallocated, counted set.

function compareCandidates(a: AllocationWorkingRow, b: AllocationWorkingRow): number {
    if (a.status_sort_priority !== b.status_sort_priority) {
        return a.status_sort_priority - b.status_sort_priority
    }

    if (a.sortable_term_key !== b.sortable_term_key) {
        return a.sortable_term_key - b.sortable_term_key
    }

    return a.original_order - b.original_order
}

// Sorts candidates by (status priority, term, original order) and returns at
// most maxCount rows. Returns [] when there are no candidates or maxCount <= 0.
export function selectRowsByCount(
    candidates: AllocationWorkingRow[],
    maxCount: number
): AllocationWorkingRow[] {
    if (candidates.length === 0 || maxCount <= 0) {
        return []
    }

    return [...candidates].sort(compareCandidates).slice(0, maxCount)
}

// Sorts candidates by (status priority, term, original order) and accumulates
// whole courses in that order until accumulated credits reach or exceed
// targetCredits. May overshoot targetCredits since only whole courses are
// selected. Returns [] when there are no candidates or targetCredits <= 0.
export function selectRowsByCredits(
    candidates: AllocationWorkingRow[],
    targetCredits: number
): AllocationWorkingRow[] {
    if (candidates.length === 0 || targetCredits <= 0) {
        return []
    }

    const sorted = [...candidates].sort(compareCandidates)
    const selected: AllocationWorkingRow[] = []
    let total = 0

    for (const row of sorted) {
        selected.push(row)
        total += row.attempt.credits

        if (total >= targetCredits) {
            break
        }
    }

    return selected
}


export function getOrderedAllocationConfig(
    allocationConfigs: AllocationConfigs,
    resolver: SpecializationRequirementResolver
): AllocationConfigRule[] {
    const configForCalendar = resolver.getAllocationConfigForCalendar(allocationConfigs)

    return [...configForCalendar].sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority
        }

        return a.bucket.localeCompare(b.bucket)
    })
}

// Reusable semicolon-list parser for raw AllocationConfigRule string fields
// (requirement_areas, canonical_rule_types). Matches the trim/discard-empty
// behavior of the resolver's private splitSemicolon, which is not exposed
// publicly.
export function splitSemicolonList(value: string | null): string[] {
    if (!value) {
        return []
    }

    return value
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
}

// Returns the SpecializationAuditRow entries belonging to one
// AllocationConfigRule's bucket. Matches Tim's df_for_bucket: a requirement
// belongs to the bucket when its requirement_area is listed in the config's
// requirement_areas, OR its rule_type is listed in canonical_rule_types. The
// rule_type path is what pulls in synthetic canonical rows (e.g.
// tools_elective_total, option_total_credits) whose requirement_area alone
// would not match. This is a per-bucket membership test (Tim's df_for_bucket),
// not the first-match-wins bucket classification of
// resolver.getBucketForRequirement (Tim's bucket_for_row), which solves a
// different problem for a different data shape (single
// SpecializationRequirementGroup, not a list of audit rows).
//
// Source order of requirements is preserved (Array.filter preserves order,
// matching Tim's boolean-mask filtering on the DataFrame).
export function getRequirementsForBucket(
    requirements: SpecializationAuditRow[],
    config: AllocationConfigRule
): SpecializationAuditRow[] {
    const requirementAreas = splitSemicolonList(config.requirement_areas)
    const canonicalRuleTypes = splitSemicolonList(config.canonical_rule_types)

    return requirements.filter(
        (requirement) =>
            requirementAreas.includes(requirement.requirement_area) ||
            canonicalRuleTypes.includes(requirement.rule_type)
    )
}

// Read-only pairing of one calendar-ordered AllocationConfigRule with the
// SpecializationAuditRow entries that belong to its bucket. No allocation
// happens here; this is groundwork for the per-bucket allocation loop in a
// later slice (mirrors Tim's `for bucket in self.config.priority_order:`).
export interface AllocationPass {
    config: AllocationConfigRule
    requirements: SpecializationAuditRow[]
}

// Builds one AllocationPass per calendar-ordered bucket, in priority order.
// A bucket with no matching requirements still produces a pass with an empty
// requirements array: Tim's allocate() loop iterates over every configured
// bucket unconditionally, and each bucket's allocation helper independently
// no-ops on an empty/zero-required input (e.g. `if rows.empty: return df`).
// Dropping empty passes here would diverge from that loop shape, so none are
// dropped.
export function buildAllocationPasses(
    allocationConfigs: AllocationConfigs,
    resolver: SpecializationRequirementResolver,
    requirements: SpecializationAuditRow[]
): AllocationPass[] {
    const orderedConfig = getOrderedAllocationConfig(allocationConfigs, resolver)

    return orderedConfig.map((config) => ({
        config,
        requirements: getRequirementsForBucket(requirements, config),
    }))
}

// ---------------------------------------------------------------------------
// Unallocated-row helper (groundwork for Slice 3)
// ---------------------------------------------------------------------------

// Matches Tim's _is_allocated: a row is allocated once
// exclusive_requirement_area is a non-empty (post-trim) string.
function isAllocatedRow(row: AllocationWorkingRow): boolean {
    return row.exclusive_requirement_area.trim() !== ''
}

// Returns counted rows that have not yet been assigned to an exclusive
// bucket. Performs no requirement-specific eligibility matching — that is
// left to Slice 3's per-requirement allocation logic.
export function getUnallocatedCountedRows(
    rows: AllocationWorkingRow[]
): AllocationWorkingRow[] {
    return rows.filter((row) => row.counted && !isAllocatedRow(row))
}
