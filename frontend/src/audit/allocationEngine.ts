import type { CourseAttempt, PlannerTerm } from '../types/coursePlan'
import type { AllocationConfigRule, AllocationConfigs } from '../types/auditRules'
import type { CourseAllocationResult } from '../types/audit'
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

// a neutral, calendar-agnostic stand-in
// for Tim's absolute term string, sortable ascending within one student plan.
function computeSortableTermKey(attempt: CourseAttempt): number {
    return attempt.year_taken * 10 + TERM_ORDINAL[attempt.term_taken]
}

// ---------------------------------------------------------------------------
// Row preparation
// ---------------------------------------------------------------------------
//
// prepareAllocationRows converts a student's course plan into the working
// data shape used by the allocation engine. This is a one-time, pre-allocation
// transformation; no further course-plan changes are expected during the
// allocation process, so the working rows are a static snapshot of the plan.
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
// The allocation engine selects candidate courses for each requirement

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
// Allocation config resolution and bucket/requirement sequencing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bucket/requirement filtering
// ---------------------------------------------------------------------------

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

export interface AllocationPass {
    config: AllocationConfigRule
    requirements: SpecializationAuditRow[]
}

// ---------------------------------------------------------------------------
// Allocation pass building
// ---------------------------------------------------------------------------

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
// Unallocated-row helper 
// ---------------------------------------------------------------------------

// a row is allocated once
// exclusive_requirement_area is a non-empty (post-trim) string.
function isAllocatedRow(row: AllocationWorkingRow): boolean {
    return row.exclusive_requirement_area.trim() !== ''
}

// Returns counted rows that have not yet been assigned to an exclusive
// bucket. Performs no requirement-specific eligibility matching
export function getUnallocatedCountedRows(
    rows: AllocationWorkingRow[]
): AllocationWorkingRow[] {
    return rows.filter((row) => row.counted && !isAllocatedRow(row))
}

// ---------------------------------------------------------------------------
// Requirement candidate lookup and exclusive assignment
// ---------------------------------------------------------------------------
// Selects counted, unallocated rows whose working_course_code is in the
// requirement's matched_courses. This is the same eligibility check Tim performs in _get_eligible_courses_by_bucket,
// but without the resolver call and without the bucket filter. The requirement's matched_courses is already pre-filtered
// to the bucket's own requirement_area, so no further bucket check is needed here.
export function getEligibleUnallocatedRowsForRequirement(
    rows: AllocationWorkingRow[],
    requirement: SpecializationAuditRow
): AllocationWorkingRow[] {
    const eligibleCourseCodes = new Set(requirement.matched_courses)

    return getUnallocatedCountedRows(rows).filter((row) =>
        eligibleCourseCodes.has(row.working_course_code)
    )
}

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


// exclusive assignment is a one-way operation: once a row is assigned to a requirement, 
// it is no longer available to any other requirement in the same pass
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
const CORE_ALLOCATION_PRIORITY = 10
const CORE_ALLOCATION_METHOD_PREFIX = 'priority_core'

// Mirrors Tim's _allocate_core_requirements
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
// Canonical Tools allocation
// ---------------------------------------------------------------------------

const TOOLS_ALLOCATION_PRIORITY = 20
const TOOLS_ALLOCATION_METHOD = 'priority_tools'

// Allocates the canonical Tools Elective requirement only. No-ops (returns
// rows unchanged) unless pass.config.bucket === 'tools'.

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
// Option / Area of Concentration allocation
// ---------------------------------------------------------------------------

const OPTION_SPECIFIC_ALLOCATION_PRIORITY = 30
const OPTION_SPECIFIC_ALLOCATION_METHOD_PREFIX = 'priority_option_specific'
const OPTION_TOTAL_ALLOCATION_PRIORITY = 35
const OPTION_TOTAL_ALLOCATION_METHOD = 'priority_option_total'


function sumAllocatedCreditsForBucket(rows: AllocationWorkingRow[], bucket: string): number {
    return rows
        .filter((row) => row.exclusive_bucket === bucket)
        .reduce((total, row) => total + row.attempt.credits, 0)
}

 
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
// Complementary Studies allocation 
// ---------------------------------------------------------------------------

const COMPLEMENTARY_ALLOCATION_PRIORITY = 40
const COMPLEMENTARY_ALLOCATION_METHOD = 'priority_complementary'

// Allocates the canonical Complementary Studies requirement only. No-ops
// (returns rows unchanged) unless pass.config.bucket === 'complementary'.

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
// Residual Electives allocation
// ---------------------------------------------------------------------------

// Allocates any counted, unallocated courses to the residual electives bucket
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
// Global allocation execution loop
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
                // chain, so this pass is silently skipped.
                break
        }
    }

    return rows
}

// ---------------------------------------------------------------------------
// Public CourseAllocationResult conversion
// ---------------------------------------------------------------------------

// Resolves the bucket for a working row. If the row has been exclusively
// assigned to a requirement, returns that requirement's bucket. Otherwise,
// returns 'unallocated' if the row is counted, or the row's allocation_method
// if the row is not counted. This matches Tim's _get_bucket_for_row logic.
function resolveAllocationBucket(row: AllocationWorkingRow): string {
    if (row.exclusive_bucket.trim() !== '') {
        return row.exclusive_bucket
    }

    if (row.counted) {
        return 'unallocated'
    }

    return row.allocation_method
}

// Converts a single AllocationWorkingRow into the public CourseAllocationResult contract. This is a 1:1 mapping; no filtering or re-sorting is performed.
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
// intermediate AllocationWorkingRow[] working set.
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
