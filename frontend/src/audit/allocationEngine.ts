import type { CourseAttempt, PlannerTerm } from '../types/coursePlan'
import type { AllocationConfigRule, AllocationConfigs } from '../types/auditRules'
import type { CourseAllocationResult } from '../types/audit'
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

// ---------------------------------------------------------------------------
// Canonical Tools allocation (Slice 4)
// ---------------------------------------------------------------------------

const TOOLS_ALLOCATION_PRIORITY = 20
const TOOLS_ALLOCATION_METHOD = 'priority_tools'

// Allocates the canonical Tools Elective requirement only. No-ops (returns
// rows unchanged) unless pass.config.bucket === 'tools'.
//
// Mirrors Tim's _allocate_canonical_course_bucket(bucket="tools", priority=20,
// method="priority_tools"):
// 1. Find the canonical Tools row: pass.requirements filtered to rule_type in
//    config.canonical_rule_types (not hardcoded to 'tools_elective_total'),
//    matching Tim's canonical_rows_for_bucket. SpecializationAuditor already
//    guarantees at most one tools_elective_total row per audit, but this
//    still takes only the first match (rows.find) to mirror Tim's
//    `rows.iloc[0]` first-row behavior in case more than one ever exists.
// 2. required_count = Math.trunc(canonical row's required), matching Tim's
//    `int(float(audit_row.get("required", 0)))`. No canonical row, or
//    required_count <= 0, is a no-op (Tim's `if rows.empty` / `if
//    required_count <= 0: return df`).
// 3. Eligibility reuses the canonical row's own matched_courses via
//    getEligibleUnallocatedRowsForRequirement — see that function's docstring
//    for why this differs from Tim's get_eligible_courses_by_bucket without
//    being a behavioral gap: AllocationEngine does not reimplement Tools rule
//    parsing here.
// 4. Selection uses selectRowsByCount directly (not selectRowsForRequirement)
//    because the canonical Tools row is always unit === 'course' by
//    construction (auditCanonicalToolsRequirement always sets unit: 'course'),
//    matching Tim's canonical course bucket, which is always count-based.
// 5. applyExclusiveAssignment supplies group_id/label/rule_type from the
//    canonical row itself and requirement_area/bucket from pass.config,
//    exactly like every other bucket's assignment call — allocation_notes is
//    always "" here, matching Tim's `notes=""` for this bucket.
//
// Mutates the AllocationWorkingRow objects referenced by `rows` in place and
// returns the same array reference, preserving row identity, count, and
// order; non-counted and non-Tools rows are untouched.
export function allocateToolsRequirement(
    rows: AllocationWorkingRow[],
    pass: AllocationPass
): AllocationWorkingRow[] {
    if (pass.config.bucket !== 'tools') {
        return rows
    }

    const canonicalRuleTypes = splitSemicolonList(pass.config.canonical_rule_types)

    const canonicalRow = pass.requirements.find((requirement) =>
        canonicalRuleTypes.includes(requirement.rule_type)
    )

    if (!canonicalRow) {
        return rows
    }

    const requiredCount = Math.trunc(canonicalRow.required)

    if (requiredCount <= 0) {
        return rows
    }

    const eligibleRows = getEligibleUnallocatedRowsForRequirement(rows, canonicalRow)

    const selectedRows = selectRowsByCount(eligibleRows, requiredCount)

    applyExclusiveAssignment(
        selectedRows,
        canonicalRow,
        pass.config,
        TOOLS_ALLOCATION_PRIORITY,
        TOOLS_ALLOCATION_METHOD
    )

    return rows
}

// ---------------------------------------------------------------------------
// Option / Area of Concentration allocation (Slice 5)
// ---------------------------------------------------------------------------

const OPTION_SPECIFIC_ALLOCATION_PRIORITY = 30
const OPTION_SPECIFIC_ALLOCATION_METHOD_PREFIX = 'priority_option_specific'
const OPTION_TOTAL_ALLOCATION_PRIORITY = 35
const OPTION_TOTAL_ALLOCATION_METHOD = 'priority_option_total'

// Sums attempt.credits for every row currently exclusively assigned to
// `bucket`. Matches Tim's `df[df["exclusive_bucket"] == bucket]["credits"].sum()`,
// evaluated fresh (after the specific-requirement loop has run) so it
// reflects whatever that loop already claimed.
function sumAllocatedCreditsForBucket(rows: AllocationWorkingRow[], bucket: string): number {
    return rows
        .filter((row) => row.exclusive_bucket === bucket)
        .reduce((total, row) => total + row.attempt.credits, 0)
}

// Allocates the Option / Area of Concentration bucket only. No-ops (returns
// rows unchanged) unless pass.config.bucket === 'option'.
//
// Mirrors Tim's _allocate_option_requirement(priority_specific=30,
// priority_total=35), in two stages:
//
// STAGE 1 — specific option requirements (Tim's specific_rows loop):
// pass.requirements, excluding rows whose rule_type is one of this bucket's
// canonical_rule_types (the canonical AoC total row(s)) OR is literally
// "theme_minimum". theme_minimum is excluded explicitly here — Tim never
// gives it its own exclusive assignment in this method (his post-allocation
// _allocated_theme_minimum_row just preserves the original pre-allocation
// audit row and defers recalculation), so this frontend does the same: a
// theme_minimum row is left alone, not routed through selectRowsForRequirement.
// Remaining specific rows are processed in source order via the same
// eligible -> select -> assign shape as allocateCoreRequirements, using
// priority=30 and method f"priority_option_specific_{rule_type}" (Tim's
// method_prefix="priority_option_specific" + rule_type from
// _allocate_group_requirement). A course claimed by an earlier specific
// requirement is unavailable to a later one in the same pass.
//
// STAGE 2 — canonical option total (Tim's canonical_rows_for_bucket lookup):
// Find the canonical row via pass.config.canonical_rule_types (not
// hardcoded to 'option_total_credits'). required_credits = canonical row's
// required. already_allocated_credits = sum of attempt.credits over EVERY
// row currently exclusive_bucket === 'option' — this includes whatever
// Stage 1 just assigned, so Tim's remaining_credits =
// max(required_credits - already_allocated_credits, 0) is a TOP-UP, not the
// full canonical target: e.g. required=15, 6 already allocated to specific
// AoC requirements -> only 9 more are selected here, not 15. If
// remaining_credits <= 0, no-op. Eligibility reuses the canonical row's own
// matched_courses via getEligibleUnallocatedRowsForRequirement (substituting
// for Tim's resolver.get_option_eligible_course_codes, matching the same
// deliberate simplification already used for the Tools bucket). Selection
// uses selectRowsByCredits directly (Tim's
// _select_unallocated_eligible_indices_by_credits), since the canonical
// option row is always unit === 'credits' by construction. Assignment uses
// priority=35 and method "priority_option_total" (fixed string, NOT
// rule_type-suffixed — unlike Stage 1's method).
//
// Mutates the AllocationWorkingRow objects referenced by `rows` in place and
// returns the same array reference, preserving row identity, count, and
// order; non-counted and non-option rows are untouched.
export function allocateOptionRequirements(
    rows: AllocationWorkingRow[],
    pass: AllocationPass
): AllocationWorkingRow[] {
    if (pass.config.bucket !== 'option') {
        return rows
    }

    const canonicalRuleTypes = splitSemicolonList(pass.config.canonical_rule_types)

    const specificRequirements = pass.requirements.filter(
        (requirement) =>
            !canonicalRuleTypes.includes(requirement.rule_type) &&
            requirement.rule_type !== 'theme_minimum'
    )

    for (const requirement of specificRequirements) {
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
            OPTION_SPECIFIC_ALLOCATION_PRIORITY,
            `${OPTION_SPECIFIC_ALLOCATION_METHOD_PREFIX}_${requirement.rule_type}`
        )
    }

    const canonicalRow = pass.requirements.find((requirement) =>
        canonicalRuleTypes.includes(requirement.rule_type)
    )

    if (!canonicalRow) {
        return rows
    }

    const requiredCredits = canonicalRow.required
    const alreadyAllocatedCredits = sumAllocatedCreditsForBucket(rows, pass.config.bucket)
    const remainingCredits = Math.max(requiredCredits - alreadyAllocatedCredits, 0)

    if (remainingCredits <= 0) {
        return rows
    }

    const eligibleRows = getEligibleUnallocatedRowsForRequirement(rows, canonicalRow)
    const selectedRows = selectRowsByCredits(eligibleRows, remainingCredits)

    applyExclusiveAssignment(
        selectedRows,
        canonicalRow,
        pass.config,
        OPTION_TOTAL_ALLOCATION_PRIORITY,
        OPTION_TOTAL_ALLOCATION_METHOD
    )

    return rows
}

// ---------------------------------------------------------------------------
// Complementary Studies allocation (Slice 6)
// ---------------------------------------------------------------------------

const COMPLEMENTARY_ALLOCATION_PRIORITY = 40
const COMPLEMENTARY_ALLOCATION_METHOD = 'priority_complementary'

// Allocates the canonical Complementary Studies requirement only. No-ops
// (returns rows unchanged) unless pass.config.bucket === 'complementary'.
//
// Mirrors Tim's _allocate_canonical_credit_bucket(bucket="complementary",
// priority=40, method="priority_complementary") — the same canonical-bucket
// shape as allocateToolsRequirement, but credit-based instead of count-based,
// and with the same "top-up" subtraction Stage 2 of allocateOptionRequirements
// uses (there is no "specific requirement" stage here; Complementary has only
// the one canonical credit bucket):
// 1. Find the canonical Complementary row: pass.requirements filtered to
//    rule_type in config.canonical_rule_types (not hardcoded to
//    'complementary_studies_credits'), taking only the first match (Tim's
//    canonical_rows_for_bucket -> rows.iloc[0]). No canonical row is a no-op.
// 2. required_credits = canonical row's required. required_credits <= 0 is a
//    no-op (Tim's `if required_credits <= 0` — reached via the shared
//    remaining_credits <= 0 check below, since already_allocated_credits is
//    never negative).
// 3. already_allocated_credits = sum of attempt.credits over every row
//    currently exclusive_bucket === 'complementary' (Tim's
//    `df[df["exclusive_bucket"] == bucket]["credits"].sum()`), so any course
//    an earlier bucket/override already placed in 'complementary' (not
//    possible yet in this frontend, since overrides are deferred, but
//    reproduced for parity) reduces the target. remaining_credits =
//    max(required_credits - already_allocated_credits, 0); <= 0 is a no-op.
// 4. Eligibility reuses the canonical row's own matched_courses via
//    getEligibleUnallocatedRowsForRequirement (substituting for Tim's
//    resolver.get_eligible_courses_by_bucket, the same deliberate
//    simplification already used for Tools/Option).
// 5. Selection uses selectRowsByCredits directly (Tim's
//    _select_unallocated_eligible_indices_by_credits), since the canonical
//    Complementary row is always unit === 'credits' by construction.
// 6. Assignment uses priority=40 and method "priority_complementary" (fixed
//    string, NOT rule_type-suffixed — matches Tools and Option's total stage,
//    not Option's specific stage).
//
// Mutates the AllocationWorkingRow objects referenced by `rows` in place and
// returns the same array reference, preserving row identity, count, and
// order; non-counted and non-complementary rows are untouched. This function
// does not hardcode calendar bucket ordering — pass.config.bucket already
// reflects whichever calendar-specific priority put 'complementary' in this
// pass, so the same code runs regardless of whether Complementary precedes or
// follows Core/Tools/Option for a given calendar.
export function allocateComplementaryRequirement(
    rows: AllocationWorkingRow[],
    pass: AllocationPass
): AllocationWorkingRow[] {
    if (pass.config.bucket !== 'complementary') {
        return rows
    }

    const canonicalRuleTypes = splitSemicolonList(pass.config.canonical_rule_types)

    const canonicalRow = pass.requirements.find((requirement) =>
        canonicalRuleTypes.includes(requirement.rule_type)
    )

    if (!canonicalRow) {
        return rows
    }

    const requiredCredits = canonicalRow.required
    const alreadyAllocatedCredits = sumAllocatedCreditsForBucket(rows, pass.config.bucket)
    const remainingCredits = Math.max(requiredCredits - alreadyAllocatedCredits, 0)

    if (remainingCredits <= 0) {
        return rows
    }

    const eligibleRows = getEligibleUnallocatedRowsForRequirement(rows, canonicalRow)
    const selectedRows = selectRowsByCredits(eligibleRows, remainingCredits)

    applyExclusiveAssignment(
        selectedRows,
        canonicalRow,
        pass.config,
        COMPLEMENTARY_ALLOCATION_PRIORITY,
        COMPLEMENTARY_ALLOCATION_METHOD
    )

    return rows
}

// ---------------------------------------------------------------------------
// Residual Electives allocation (Slice 7)
// ---------------------------------------------------------------------------
//
// Mirrors Tim's _allocate_residual_electives(bucket, priority=50), called from
// allocate()'s bucket loop via `elif bucket == self.config.residual_bucket:`.
// self.config.residual_bucket defaults to the literal string "electives"
// (models.AllocationConfig.residual_bucket) and is only ever overridden by an
// optional `residual_bucket` column in allocation_config.csv — neither the
// 2024-2025 nor 2026-2027 CSV defines that column, so both calendars use the
// default. AllocationConfigRule (types/auditRules.ts) has no residual_bucket
// field at all, so there is nothing to read dynamically here; 'electives' is
// hardcoded, matching every other allocate*Requirement function's bucket
// literal (e.g. allocateCoreRequirements checks `pass.config.bucket !== 'core'`).
//
// Unlike every earlier bucket, Tim's residual-elective method takes NO
// specialization_audit / requirement rows at all — it is not called with one,
// and does no per-requirement lookup. It walks the full allocation DataFrame
// directly:
//
//   for idx, row in df.iterrows():
//       if not self._is_counted_row(row): continue
//       if self._is_allocated(row): continue
//       df = self._assign_course(..., group_id="", label=self.config.residual_label,
//                                 rule_type="residual_elective", bucket=bucket,
//                                 priority=priority, method="residual_elective",
//                                 notes="Allocated as residual elective after priority requirements.")
//
// This confirms every TASK from the brief:
// - TASK B: the candidate set is exactly getUnallocatedCountedRows(rows) — no
//   course-code eligibility matching of any kind (no matched_courses lookup,
//   no resolver call). Every counted, still-unallocated row becomes elective.
//   This is a true fallback bucket.
// - TASK C: no requirement row (canonical or otherwise) is used. group_id is
//   the empty string, label is the config's fixed residual_label string (NOT
//   pulled from any row), rule_type is the fixed string "residual_elective".
//   requirement_area is display_name_for_bucket(bucket) — pass.config.display_name
//   here, exactly like every other bucket's requirement_area.
// - TASK D: priority=50 is confirmed by the call site
//   (`_allocate_residual_electives(..., priority=50)` in allocate()).
//   allocation_method is the literal string "residual_elective" — NOT
//   "priority_elective" as the task brief's own guess suggested; Tim's other
//   buckets use a "priority_*" method naming convention, but this one does not.
//   allocation_notes is always the fixed non-empty string below (unlike every
//   earlier bucket's assignment calls, which all pass notes="").
// - TASK E: Tim applies no selection/sort ordering before assigning — every
//   qualifying row is assigned in DataFrame iteration order (original row
//   order). getUnallocatedCountedRows filters via Array.filter, which
//   preserves source order, so no extra sort is needed or applied here.
// - TASK F: there is no credit or count cap, and no "remaining credits"
//   subtraction against any canonical row — every unallocated counted row is
//   assigned, unconditionally.
//
// Mutates the AllocationWorkingRow objects referenced by `rows` in place and
// returns the same array reference, preserving row identity, count, and
// order; non-counted and already-allocated rows are untouched.
const RESIDUAL_ELECTIVE_ALLOCATION_PRIORITY = 50
const RESIDUAL_ELECTIVE_ALLOCATION_METHOD = 'residual_elective'
const RESIDUAL_ELECTIVE_RULE_TYPE = 'residual_elective'
const RESIDUAL_ELECTIVE_LABEL = 'Residual elective / unallocated counted course'
const RESIDUAL_ELECTIVE_NOTES = 'Allocated as residual elective after priority requirements.'

export function allocateResidualElectives(
    rows: AllocationWorkingRow[],
    pass: AllocationPass
): AllocationWorkingRow[] {
    if (pass.config.bucket !== 'electives') {
        return rows
    }

    const unallocatedRows = getUnallocatedCountedRows(rows)

    for (const row of unallocatedRows) {
        row.exclusive_requirement_area = pass.config.display_name
        row.exclusive_group_id = ''
        row.exclusive_label = RESIDUAL_ELECTIVE_LABEL
        row.exclusive_rule_type = RESIDUAL_ELECTIVE_RULE_TYPE
        row.exclusive_bucket = pass.config.bucket
        row.allocation_priority = RESIDUAL_ELECTIVE_ALLOCATION_PRIORITY
        row.allocation_method = RESIDUAL_ELECTIVE_ALLOCATION_METHOD
        row.allocation_notes = RESIDUAL_ELECTIVE_NOTES
    }

    return rows
}

// ---------------------------------------------------------------------------
// Global allocation execution loop (Slice 8)
// ---------------------------------------------------------------------------
//
// Mirrors the bucket-dispatch stage of Tim's AllocationEngine.allocate():
//
//   for bucket in self.config.priority_order:
//       if bucket == "core": ...
//       elif bucket == "tools": ...
//       elif bucket == "option": ...
//       elif bucket == "complementary": ...
//       elif bucket == self.config.residual_bucket: ...
//
// which is a plain if/elif chain, evaluated once per configured bucket in
// self.config.priority_order (already calendar-ordered by the time allocate()
// sees it). This function reproduces exactly that: build the calendar-ordered
// passes once via buildAllocationPasses (which already sorted by config
// priority — see getOrderedAllocationConfig), then dispatch each pass, in the
// order given, to the one allocator whose bucket literal matches.
//
// DISPATCH TABLE (exact, matches Tim's if/elif chain one-for-one):
//   core          -> allocateCoreRequirements
//   tools         -> allocateToolsRequirement
//   option        -> allocateOptionRequirements
//   complementary -> allocateComplementaryRequirement
//   electives     -> allocateResidualElectives  (Tim's self.config.residual_bucket;
//                     AllocationConfigRule has no residual_bucket field and
//                     neither calendar's CSV overrides it, so 'electives' is
//                     the literal default residual bucket name here too — see
//                     the "Residual Electives allocation" note above.)
//
// UNKNOWN BUCKET BEHAVIOR: Tim's if/elif chain has no branch for a bucket
// name it doesn't recognize, so that iteration of his `for bucket in
// self.config.priority_order` loop does nothing — the DataFrame passes
// through that iteration completely unchanged, and the loop moves on to the
// next bucket. This function reproduces that exactly via the `default` case
// below: an unrecognized pass.config.bucket is skipped (no allocator is
// called, rows are left as-is), NOT remapped to electives or any other
// bucket. This is a deliberate no-op, not an error, matching Tim's silent
// fallthrough.
//
// CALENDAR ORDER: this function does not sort or re-derive bucket order.
// buildAllocationPasses already returns passes sorted by
// getOrderedAllocationConfig (config priority ascending, tie-broken by
// bucket name), which is itself calendar-specific via
// resolver.getAllocationConfigForCalendar. This loop simply iterates
// `passes` in the order given — e.g. 2024-2025 yields core, tools, option,
// complementary, electives, while 2026-2027 yields complementary, core,
// tools, option, electives (per that calendar's allocation_config.csv
// priorities). No bucket sequence is hardcoded here.
//
// MISSING CONFIG: if the student's calendar_year has no entry in
// allocationConfigs, getAllocationConfigForCalendar (via
// getOrderedAllocationConfig) returns [], so buildAllocationPasses returns
// [] and this loop's body never executes. That matches Tim's behavior for
// an empty self.config.priority_order (an empty iterable for-loop is a
// no-op in Python; there is no explicit "missing config" error path in
// allocate() to preserve or diverge from). rows are returned exactly as
// prepareAllocationRows built them: every attempt present, non-counted rows
// marked not_counted_status, counted rows unallocated (empty
// exclusive_requirement_area, allocation_priority null, allocation_method
// '').
//
// OVERRIDE GAP: Tim's allocate() calls self._apply_allocation_overrides(...)
// immediately after _add_allocation_sort_columns and BEFORE the bucket loop
// above (see allocation_engine.py's allocate(), the call directly preceding
// `for bucket in self.config.priority_order:`). This frontend function
// intentionally does NOT call anything equivalent: CourseAttempt has no
// override/effective-course-code contract yet (see AllocationWorkingRow's
// "KNOWN LIMITATIONS" #1 at the top of this file), so there is nothing
// truthful to apply overrides from. allocateCourses therefore goes straight
// from prepareAllocationRows into the priority bucket passes. This is an
// explicit, deferred gap, not an oversight — do not simulate override
// behavior here.
//
// NOT DONE HERE (later slices, per Tim's allocate() after the bucket loop):
// also_counts_toward population, double-counting, and the
// CourseAllocationResult conversion. This function returns the raw
// AllocationWorkingRow[] working set only.
//
// MUTATION MODEL: every allocate*Requirement helper mutates the
// AllocationWorkingRow objects in `rows` in place and returns that same
// array reference. This loop calls them for their mutation side effect only
// and does not reassign or clone `rows` between passes, so exclusive
// assignments made by an earlier pass (e.g. core) are visible to every
// later pass's getUnallocatedCountedRows / getEligibleUnallocatedRowsForRequirement
// calls (e.g. tools, option, complementary, electives) — required for
// cross-bucket exclusivity, exactly as in Tim's single shared `allocation`
// DataFrame.
export function allocateCourses(
    student_course_plan: CourseAttempt[],
    specializationAudit: SpecializationAuditRow[],
    allocationConfigs: AllocationConfigs,
    resolver: SpecializationRequirementResolver
): AllocationWorkingRow[] {
    const rows = prepareAllocationRows(student_course_plan)
    const passes = buildAllocationPasses(allocationConfigs, resolver, specializationAudit)

    for (const pass of passes) {
        switch (pass.config.bucket) {
            case 'core':
                allocateCoreRequirements(rows, pass)
                break
            case 'tools':
                allocateToolsRequirement(rows, pass)
                break
            case 'option':
                allocateOptionRequirements(rows, pass)
                break
            case 'complementary':
                allocateComplementaryRequirement(rows, pass)
                break
            case 'electives':
                allocateResidualElectives(rows, pass)
                break
            default:
                // Unrecognized bucket: matches no branch in Tim's if/elif
                // chain, so this pass is silently skipped. Do not remap to
                // electives or any other bucket.
                break
        }
    }

    return rows
}

// ---------------------------------------------------------------------------
// Public CourseAllocationResult conversion (Slice 9)
// ---------------------------------------------------------------------------
//
// Converts the internal AllocationWorkingRow[] working set into the public
// CourseAllocationResult[] contract (types/audit.ts). This is the boundary
// between AllocationEngine's internal representation and the rest of the
// app: internal-only fields (attempt, working_course_code,
// status_sort_priority, original_order, sortable_term_key,
// exclusive_rule_type, allocation_priority, override_used) are deliberately
// dropped here, matching Tim's allocate(), which similarly drops its
// internal sort columns (_status_priority, _original_order) before returning
// the final DataFrame.
//
// One AllocationWorkingRow always produces exactly one CourseAllocationResult
// — no filtering, splitting, or merging. Every original attempt stays
// represented, including non-counted (failed/withdrawn) and still-planned
// attempts.

// Matches the fixture convention documented in utils/exampleAuditResult.ts:
// bucket falls back to allocation_method when exclusive_bucket is blank,
// since bucket is a required field on CourseAllocationResult. Non-counted
// rows always have a blank exclusive_bucket and allocation_method ===
// "not_counted_status" (see prepareAllocationRows), so they resolve to
// "not_counted_status" here, exactly like the fixture.
//
// Counted rows can still have a blank exclusive_bucket AND a blank
// allocation_method only when the student's calendar has no allocation
// config (buildAllocationPasses returns [] — see allocateCourses' "MISSING
// CONFIG" note): every bucket pass is skipped, so nothing ever assigns
// exclusive_bucket or allocation_method. Falling back to allocation_method
// in that case would produce "", which is not a real bucket and cannot
// stand in for one. The literal string "unallocated" is used instead — this
// is not a fabricated allocation, it is a recognized alias already wired
// into the UI's "Excluded / Not Counted" bucket group (see
// components/audit/auditBucketStyles.ts BUCKET_STYLES "excluded" entry,
// whose allocationBucketAliases already includes "unallocated" for exactly
// this case).
function resolveAllocationBucket(row: AllocationWorkingRow): string {
    if (row.exclusive_bucket.trim() !== '') {
        return row.exclusive_bucket
    }

    if (row.counted) {
        return 'unallocated'
    }

    return row.allocation_method
}

// Converts one AllocationWorkingRow into one CourseAllocationResult, mapping
// every field of the public contract from either the original CourseAttempt
// (identity/attempt fields Tim's allocation output leaves untouched) or the
// working row's own allocation columns (fields Tim's allocate() writes).
// course_code is read from row.course_code (not working_course_code): both
// are equal today (see AllocationWorkingRow's KNOWN LIMITATIONS #1), but
// course_code is the field name that survives the internal/public boundary.
function toCourseAllocationResult(row: AllocationWorkingRow): CourseAllocationResult {
    return {
        row_id: row.attempt_id,
        attempt_id: row.attempt_id,
        course_code: row.course_code,
        year_taken: row.attempt.year_taken,
        credits: row.attempt.credits,
        status: row.attempt.status,
        grade: row.attempt.grade,
        percentage: row.attempt.percentage,
        bucket: resolveAllocationBucket(row),
        allocation_method: row.allocation_method,
        allocation_notes: row.allocation_notes,
        counted: row.counted,
        exclusive_requirement_area: row.exclusive_requirement_area,
        exclusive_group_id: row.exclusive_group_id,
        exclusive_label: row.exclusive_label,
        also_counts_toward: row.also_counts_toward,
        double_count_allowed: row.double_count_allowed,
        double_count_groups: row.double_count_groups,
    }
}

// Converts the full AllocationWorkingRow[] working set produced by
// allocateCourses into the public CourseAllocationResult[] contract. Order is
// preserved 1:1 with the input array (no re-sorting, no filtering).
export function toCourseAllocationResults(
    rows: AllocationWorkingRow[]
): CourseAllocationResult[] {
    return rows.map(toCourseAllocationResult)
}

// Convenience wrapper combining allocateCourses + toCourseAllocationResults
// for callers that only need the public contract and don't need the
// intermediate AllocationWorkingRow[] working set. Not yet wired into
// runAudit.ts — see Slice 9 task scope.
export function runAllocation(
    student_course_plan: CourseAttempt[],
    specializationAudit: SpecializationAuditRow[],
    allocationConfigs: AllocationConfigs,
    resolver: SpecializationRequirementResolver
): CourseAllocationResult[] {
    return toCourseAllocationResults(
        allocateCourses(student_course_plan, specializationAudit, allocationConfigs, resolver)
    )
}
