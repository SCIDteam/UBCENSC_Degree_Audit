import type { CourseAttempt, PlannerTerm } from '../types/coursePlan'
import type { AllocationConfigRule, AllocationConfigs } from '../types/auditRules'
import type { SpecializationAuditRow } from './specializationAuditor'
import type { SpecializationRequirementResolver } from './specializationRequirementResolver'

// ---------------------------------------------------------------------------
// AllocationWorkingRow
// ---------------------------------------------------------------------------
//
// Internal pre-bucket working representation for the AllocationEngine.
// Mirrors the first stage of Tim's AllocationEngine.allocate() (Python):
// copy every classified course, ensure allocation columns exist, mark
// non-counted rows, and add deterministic sort fields. Overrides, exclusive
// bucket assignment, double-counting, and also_counts_toward computation are
// NOT performed here — those are later slices.
//
// This is distinct from the public CourseAllocationResult contract
// (types/audit.ts), which represents the final, post-allocation output.
//
// KNOWN LIMITATIONS vs Tim's Python model:
//
// 1. effective_course_code: CourseAttempt does not yet expose an
//    override/effective course code contract (override_course_code only
//    exists on the separate AuditCourseInput type, and is always null in the
//    current adapter). working_course_code is therefore just course_code.
//    Replace this once effective_course_code is real.
//
// 2. sortable term key: Tim sorts on an absolute term string (e.g.
//    "2024W1"). CourseAttempt has no such field — only year_taken (relative
//    program year) and term_taken. toAbsoluteTerm() (utils/auditInputAdapter)
//    can build the real equivalent, but it requires calendar_year from the
//    student profile, which this function intentionally does not take (see
//    prepareAllocationRows). sortable_term_key is instead derived only from
//    year_taken/term_taken. This preserves correct chronological ordering
//    within one student's plan (the only thing candidate selection needs)
//    but is NOT calendar-anchored and must not be compared across profiles
//    or reused as a display value.
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

// ---------------------------------------------------------------------------
// Allocation config resolution and bucket/requirement sequencing (Slice 2)
// ---------------------------------------------------------------------------
//
// IMPORTANT: config priority (below) is a different concept from
// AllocationWorkingRow.status_sort_priority (above). Config priority decides
// WHICH BUCKET gets first opportunity to allocate (core before tools before
// option, etc., per calendar). status_sort_priority decides WHICH COURSE
// within one bucket's candidate set gets selected first (completed before
// in_progress before planned). Nothing in this section touches
// status_sort_priority, and nothing allocates a course to a bucket yet.

// Returns the AllocationConfigRule[] for the resolver's student profile
// calendar_year, sorted ascending by priority. Ties are broken by bucket name
// (ascending), matching Tim's AllocationConfig.from_dataframe, which sorts
// allocation_config.csv `by=["priority_numeric", "bucket"]`. Calendars
// intentionally differ (e.g. complementary is priority 10 in 2026-2027 vs 40
// in 2024-2025) and are never normalized into one global ordering.
//
// Does not mutate allocationConfigs or the resolver's underlying data.
//
// Missing-calendar behavior: resolver.getAllocationConfigForCalendar already
// returns [] when allocationConfigs has no entry for the student's
// calendar_year (it does not fall back to another calendar). This function
// preserves that: an unrecognized calendar deterministically yields [].
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

// ---------------------------------------------------------------------------
// Requirement candidate lookup and exclusive assignment (Slice 3)
// ---------------------------------------------------------------------------
//
// Returns counted, unallocated AllocationWorkingRow entries whose
// working_course_code appears in requirement.matched_courses.
//
// matched_courses comes from the pre-allocation SpecializationAuditRow and is
// reused as-is as the eligibility basis: it is already the resolved set of
// concrete course codes SpecializationAuditor matched for this requirement
// (via resolver.getGroupCourseCodes / courseMatchesLevelRequirement / etc,
// depending on rule_type), so AllocationEngine does not need to re-derive
// eligibility (e.g. level_requirement subject/level parsing) itself. This
// intentionally differs from Tim's Python, which recomputes eligible course
// codes from the resolver inside the allocation engine
// (_eligible_unallocated_indices / _eligible_level_requirement_indices) —
// reusing matched_courses here is a deliberate simplification, not a
// behavioral gap, since both paths resolve to the same eligible course set.
//
// No deduplication by course code: matches Tim's _eligible_unallocated_indices,
// which iterates every row of the allocation DataFrame and does not collapse
// repeated attempts of the same course. If a student has two counted,
// unallocated attempts of an eligible course, BOTH rows are returned here;
// which one (or both) gets selected is decided later by
// selectRowsByCount/selectRowsByCredits sort order, exactly as in Tim's
// engine. (SpecializationAuditor's own matched_courses list is
// course-code-deduplicated for completion counting — that dedup already
// happened upstream and is not repeated here.)
//
// Does not mutate the requirement row or its matched_courses array.
export function getEligibleUnallocatedRowsForRequirement(
    rows: AllocationWorkingRow[],
    requirement: SpecializationAuditRow
): AllocationWorkingRow[] {
    const eligibleCourseCodes = new Set(requirement.matched_courses)

    return getUnallocatedCountedRows(rows).filter((row) =>
        eligibleCourseCodes.has(row.working_course_code)
    )
}

// Selects candidate rows for one requirement using its own required amount
// (NOT its pre-allocation `remaining`): pre-allocation `completed` counts
// every possible match, including courses a higher-priority bucket may claim
// first, so `remaining` is not a valid allocation target here. The target is
// always requirement.required, evaluated against whatever eligible rows are
// still unallocated at the time this is called.
//
// unit === 'course'  -> select up to `required` rows by count.
// unit === 'credits' -> accumulate whole rows until `required` credits are met/exceeded.
// unit === 'categories' (theme_minimum) is not supported here: Core never
// produces categories-unit requirements, and theme_minimum belongs to later
// AoC/theme handling, not this generic selector.
export function selectRowsForRequirement(
    candidates: AllocationWorkingRow[],
    requirement: SpecializationAuditRow
): AllocationWorkingRow[] {
    if (requirement.unit === 'credits') {
        return selectRowsByCredits(candidates, requirement.required)
    }

    if (requirement.unit === 'course') {
        return selectRowsByCount(candidates, requirement.required)
    }

    return []
}

// Writes the exclusive-assignment fields Tim's _assign_course sets for
// ordinary (non-override) allocation, in place, on each selected row.
// allocation_notes is always "" here, matching Tim's _allocate_group_requirement
// call (`notes=""`) for ordinary requirement-group allocation.
//
// Deliberately does NOT touch override_used, double_count_allowed,
// double_count_groups, or also_counts_toward — those keep whatever
// prepareAllocationRows initialized them to. override_used is only ever set
// by Tim when method.startswith("override"), which never happens in this
// slice.
//
// Mutates selectedRows in place (mirrors Tim's `df.at[idx, ...] = ...`
// DataFrame mutation) rather than rebuilding the array, since selectedRows is
// already the exact, order-preserved subset to change — no reordering or
// discarding occurs.
export function applyExclusiveAssignment(
    selectedRows: AllocationWorkingRow[],
    requirement: SpecializationAuditRow,
    config: AllocationConfigRule,
    allocationPriority: number,
    allocationMethod: string
): void {
    for (const row of selectedRows) {
        row.exclusive_requirement_area = config.display_name
        row.exclusive_group_id = requirement.group_id
        row.exclusive_label = requirement.label
        row.exclusive_rule_type = requirement.rule_type
        row.exclusive_bucket = config.bucket
        row.allocation_priority = allocationPriority
        row.allocation_method = allocationMethod
        row.allocation_notes = ''
    }
}

// Tim hardcodes priority=10 for every ordinary core group requirement
// (_allocate_core_requirements -> _allocate_group_requirement(..., priority=10,
// method_prefix="priority_core")). This is NOT the same number as this
// calendar's config.priority for the core bucket (which varies: 10 in
// 2024-2025, 20 in 2026-2027) — allocation_priority is a fixed semantic tier
// marker for the assignment method, independent of calendar bucket
// sequencing. See the Slice 2 IMPORTANT note above for the related
// config-priority-vs-status_sort_priority distinction; this is a third,
// separate concept.
const CORE_ALLOCATION_PRIORITY = 10
const CORE_ALLOCATION_METHOD_PREFIX = 'priority_core'

// Allocates the Core Requirement bucket only. No-ops (returns rows
// unchanged) unless pass.config.bucket === 'core'.
//
// Mirrors Tim's _allocate_core_requirements:
// 1. Start from pass.requirements (already Tim's df_for_bucket(bucket="core")
//    equivalent, built by buildAllocationPasses).
// 2. Exclude rows whose rule_type is one of this bucket's own
//    canonical_rule_types (core's canonical_rule_types is empty in the
//    current rules data, so this is currently a no-op, but is preserved for
//    correctness if that ever changes).
// 3. Process the remaining requirements in source order (pass.requirements
//    order is never re-sorted here) — Tim iterates core_rows via
//    `for _, group in core_rows.iterrows()`, which preserves DataFrame row
//    order.
// 4. For each requirement with required > 0: look up currently
//    counted+unallocated+eligible rows, select via selectRowsForRequirement,
//    and exclusively assign the selection before moving to the next
//    requirement — so a course claimed by an earlier Core requirement is
//    unavailable to a later one in the same pass (no double counting).
//
// requirement.required <= 0 rows are skipped entirely (no eligibility lookup,
// no assignment). This is the same mechanism Tim uses
// (`if required <= 0: return df` in _allocate_group_requirement), and it is
// what naturally excludes manual-review rows (createManualReviewRow always
// sets required: 0) without needing a separate rule_type/status check.
//
// Rule types are not allowlisted here: like Tim, any requirement that
// survives the canonical-rule-type exclusion and has required > 0 is
// processed generically. In practice, for the current rules data, that means
// required_course, required_all, choose_n, and level_requirement rows filed
// under "Core Requirement" — because those are the only rule types
// SpecializationAuditor emits for that requirement_area.
//
// Mutates the AllocationWorkingRow objects referenced by `rows` in place and
// returns the same array reference: row identity, count, and order are all
// unchanged; only rows selected for a Core requirement gain exclusive
// assignment fields. Non-counted rows are untouched and remain in the array.
export function allocateCoreRequirements(
    rows: AllocationWorkingRow[],
    pass: AllocationPass
): AllocationWorkingRow[] {
    if (pass.config.bucket !== 'core') {
        return rows
    }

    const canonicalRuleTypes = splitSemicolonList(pass.config.canonical_rule_types)

    const coreRequirements = pass.requirements.filter(
        (requirement) => !canonicalRuleTypes.includes(requirement.rule_type)
    )

    for (const requirement of coreRequirements) {
        if (requirement.required <= 0) {
            continue
        }

        const eligibleRows = getEligibleUnallocatedRowsForRequirement(rows, requirement)

        if (eligibleRows.length === 0) {
            continue
        }

        const selectedRows = selectRowsForRequirement(eligibleRows, requirement)

        applyExclusiveAssignment(
            selectedRows,
            requirement,
            pass.config,
            CORE_ALLOCATION_PRIORITY,
            `${CORE_ALLOCATION_METHOD_PREFIX}_${requirement.rule_type}`
        )
    }

    return rows
}
