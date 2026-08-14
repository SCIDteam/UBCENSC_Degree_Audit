import type { AllocationConfigRule, AllocationConfigs } from '../types/auditRules'
import type { AuditProgressUnit, AuditRequirementStatus, SpecializationRequirementResult } from '../types/audit'
import type { OptionId } from '../utils/setupOptions'

import type { SpecializationAuditRow } from './specializationAuditor'
import type { AllocationWorkingRow } from './allocationEngine'
import { getOrderedAllocationConfig, splitSemicolonList } from './allocationEngine'
import type { SpecializationRequirementResolver } from './specializationRequirementResolver'

// ---------------------------------------------------------------------------
// Post-allocation specialization rebuild (Slice 10)
// ---------------------------------------------------------------------------
//
// TypeScript equivalent of Tim's AllocationEngine.build_allocated_specialization_audit
// (allocation_engine.py). Rebuilds the pre-allocation SpecializationAuditRow[]
// (possible matches, see specializationAuditor.ts) into the public,
// post-allocation SpecializationRequirementResult[] contract (types/audit.ts),
// using the exclusive assignment metadata written by allocationEngine.ts.
//
// For each pre-allocation row, Tim's dispatch is (in order):
//   1. bucket = resolver.bucket_for_row(row)  -- first bucket (in calendar
//      priority order) whose requirement_areas or canonical_rule_types match.
//   2. bucket === "option"/"tools"/"complementary" AND row.rule_type is one of
//      that bucket's canonical_rule_types -> canonical bucket recalculation
//      (credit sum for option/complementary, distinct course count for tools).
//   3. row.rule_type === "theme_minimum" -> deferred passthrough (see
//      buildThemeMinimumPassthrough below).
//   4. bucket in {"core", "option"} (and not caught by 2/3) -> ordinary
//      specific-requirement-group recalculation using exclusive_group_id.
//   5. otherwise -> preserved passthrough (no allocation-specific
//      recalculation defined for this row).
//
// This module reproduces that exact dispatch shape. Not wired into
// runAudit.ts yet (see task scope).

// ---------------------------------------------------------------------------
// Bucket resolution helpers
// ---------------------------------------------------------------------------

// Mirrors Tim's resolver.bucket_for_row: the first bucket (in calendar
// priority order) whose requirement_areas includes this row's
// requirement_area, or whose canonical_rule_types includes this row's
// rule_type. Returns null when no configured bucket matches (Tim returns "").
//
// This is deliberately NOT resolver.getBucketForRequirement: that method
// takes a SpecializationRequirementGroup (many required fields
// SpecializationAuditRow does not carry). SpecializationAuditRow already
// carries the two fields bucket_for_row actually reads (requirement_area,
// rule_type), so a small local equivalent avoids an unsound cast.
function resolveBucketForAuditRow(
    row: SpecializationAuditRow,
    orderedConfig: AllocationConfigRule[]
): string | null {
    for (const config of orderedConfig) {
        const requirementAreas = splitSemicolonList(config.requirement_areas)

        if (requirementAreas.includes(row.requirement_area)) {
            return config.bucket
        }

        const canonicalRuleTypes = splitSemicolonList(config.canonical_rule_types)

        if (canonicalRuleTypes.includes(row.rule_type)) {
            return config.bucket
        }
    }

    return null
}

function canonicalRuleTypesForBucket(bucket: string, orderedConfig: AllocationConfigRule[]): string[] {
    const config = orderedConfig.find((candidate) => candidate.bucket === bucket)
    return config ? splitSemicolonList(config.canonical_rule_types) : []
}

function bucketDisplayName(bucket: string, orderedConfig: AllocationConfigRule[]): string {
    return orderedConfig.find((candidate) => candidate.bucket === bucket)?.display_name ?? bucket
}

// ---------------------------------------------------------------------------
// Double-count helpers
// ---------------------------------------------------------------------------
//
// KNOWN PARITY GAP (Task I): Tim's _double_count_matches_bucket also treats a
// double_count_groups token as a group_id and infers that group's bucket via
// resolver.bucket_for_row + get_group_metadata. That third tier is not
// implemented here: double_count_groups is always [] under the current
// AllocationWorkingRow contract (no override pipeline populates it yet — see
// allocationEngine.ts's AllocationWorkingRow "Override / double-count fields"
// comment), so this tier is currently unreachable either way. Only the direct
// bucket-name / bucket-display-name and exact-group-id tiers are implemented,
// which is everything Tim's own bucket/group matching can act on without
// building new override behavior.

function doubleCountsTowardGroup(row: AllocationWorkingRow, groupId: string): boolean {
    return row.double_count_allowed && row.double_count_groups.includes(groupId)
}

function doubleCountsTowardBucket(
    row: AllocationWorkingRow,
    bucket: string,
    orderedConfig: AllocationConfigRule[]
): boolean {
    if (!row.double_count_allowed || row.double_count_groups.length === 0) {
        return false
    }

    if (row.double_count_groups.includes(bucket)) {
        return true
    }

    return row.double_count_groups.includes(bucketDisplayName(bucket, orderedConfig))
}

// Matches Tim's _allocation_counts_for_bucket: rows exclusively assigned to
// `bucket`, plus rows approved to double-count toward it.
function rowsForBucket(
    allocationRows: AllocationWorkingRow[],
    bucket: string,
    orderedConfig: AllocationConfigRule[]
): AllocationWorkingRow[] {
    return allocationRows.filter(
        (row) => row.exclusive_bucket.trim() === bucket || doubleCountsTowardBucket(row, bucket, orderedConfig)
    )
}

// ---------------------------------------------------------------------------
// Course-code list helpers
// ---------------------------------------------------------------------------
//
// Matches Tim's _course_list: distinct course codes, first-occurrence order
// preserved (not a bare Set spread, so order is deterministic and doesn't
// depend on Set iteration semantics happening to match insertion order for
// this use — it always does for strings, but writing the loop explicitly
// keeps this file's intent self-evident per Task H).
function distinctCourseCodes(rows: AllocationWorkingRow[]): string[] {
    const seen = new Set<string>()
    const codes: string[] = []

    for (const row of rows) {
        if (seen.has(row.course_code)) {
            continue
        }

        seen.add(row.course_code)
        codes.push(row.course_code)
    }

    return codes
}

function dedupeByCourseCode(rows: AllocationWorkingRow[]): AllocationWorkingRow[] {
    const seen = new Set<string>()
    const result: AllocationWorkingRow[] = []

    for (const row of rows) {
        if (seen.has(row.course_code)) {
            continue
        }

        seen.add(row.course_code)
        result.push(row)
    }

    return result
}

// ---------------------------------------------------------------------------
// Status / result assembly
// ---------------------------------------------------------------------------

// Matches the status helper already established by
// createSpecializationAuditRow in specializationAuditor.ts (NOT Tim's
// _make_allocated_row, which returns "review" when required === 0 — that
// status has no home in the public AuditRequirementStatus union, and no
// canonical/ordinary row reaching this helper has required === 0 by
// construction: canonical rows are only ever built when their required
// target is positive, and manual-review rows are intercepted before this
// helper runs. See buildManualReviewResult for the one case that legitimately
// needs a non-computed status).
function computeStatus(required: number, completed: number): AuditRequirementStatus {
    if (completed >= required) return 'satisfied'
    if (completed > 0) return 'partial'
    return 'missing'
}

// Shared result assembly for every branch except manual review. `completed`
// is intentionally NOT capped at `required` here (see the module-level
// "IMPORTANT FRONTEND DECISION" callout in the task brief this file
// implements): Tim's own _allocated_specific_group_row caps completed at
// required for course-unit rows, but this frontend already established
// uncapped completed/surplus as the intentional presentation semantics for
// specialization rows (specializationAuditor.ts's level_requirement handler
// does the same). Allocation *eligibility* below is still fully Tim-faithful;
// only the final displayed completed/surplus number is deliberately uncapped.
function buildResult(
    preRow: SpecializationAuditRow,
    completed: number,
    required: number,
    unit: AuditProgressUnit,
    allocatedCourses: string[],
    notes: string
): SpecializationRequirementResult {
    const remaining = Math.max(required - completed, 0)
    const surplus = Math.max(completed - required, 0)

    return {
        group_id: preRow.group_id,
        requirement_area: preRow.requirement_area,
        // Requirement group option_id is loosely typed (string | null) since
        // it is sourced from rules data, not validated against the narrower
        // OptionId literal union at load time. The public contract requires
        // OptionId | null, so this is the one boundary cast needed to cross
        // from the internal to the public representation.
        option_id: preRow.option_id as OptionId | null,
        option_name: preRow.option_name,
        theme: preRow.theme,
        label: preRow.label,
        rule_type: preRow.rule_type,
        status: computeStatus(required, completed),
        completed,
        required,
        remaining,
        surplus,
        unit,
        allocated_courses: allocatedCourses,
        allocation_notes: notes,
    }
}

// ---------------------------------------------------------------------------
// TASK F — Manual review rows
// ---------------------------------------------------------------------------
//
// Internal pre-allocation rows can carry status: 'review' (rule_type:
// 'course_list_review', always required: 0, completed: 0, matched_courses: []
// — see createManualReviewRow in specializationAuditor.ts). The public
// AuditRequirementStatus union has no 'review' member and must not gain one.
//
// These rows are intercepted BEFORE bucket dispatch rather than routed
// through buildAllocatedSpecificGroupRow (which is what Tim's own
// bucket_for_row/rule_type dispatch would do if the group's requirement_area
// happens to map to the core/option bucket). Reasoning: required is always 0
// for these rows, so AllocationEngine's allocation pass always skips them
// entirely (`if required <= 0: return df` in Tim's _allocate_group_requirement
// / the `requirement.required <= 0` guards in allocationEngine.ts) — no
// course is ever exclusively assigned to a manual-review group_id. Tim's
// _allocated_specific_group_row would then fall back to its unfiltered
// bucket_match tier (its `if eligible_courses:` guard only applies the
// eligibility filter when the group has a non-empty course list, and manual-
// review groups have none by definition — that's the reason they need manual
// review), attributing every course in the bucket to the row. That is a
// Python fragility, not a semantic requirement worth reproducing: it would
// make a "needs manual review" row look like it has real allocated courses.
// Mapped instead to the one public status built for exactly this situation:
// 'not_applicable' (already used by FacultyRequirements/PromotionRequirements
// to mean "no automated progress to show").
function buildManualReviewResult(preRow: SpecializationAuditRow): SpecializationRequirementResult {
    const notes = preRow.notes
        ? `${preRow.notes} Manual review required; not evaluated by automated allocation.`
        : 'Manual review required; not evaluated by automated allocation.'

    return {
        group_id: preRow.group_id,
        requirement_area: preRow.requirement_area,
        option_id: preRow.option_id as OptionId | null,
        option_name: preRow.option_name,
        theme: preRow.theme,
        label: preRow.label,
        rule_type: preRow.rule_type,
        status: 'not_applicable',
        completed: 0,
        required: 0,
        remaining: 0,
        surplus: 0,
        unit: preRow.unit,
        allocated_courses: [],
        allocation_notes: notes,
    }
}

// ---------------------------------------------------------------------------
// TASK E — Theme minimum (deferred, Tim-faithful passthrough)
// ---------------------------------------------------------------------------
//
// Tim's own _allocated_theme_minimum_row is, verbatim, a first-pass
// placeholder: it does not recompute anything from course_allocation at all.
// It preserves the pre-allocation audit_row's status/completed/required/
// remaining/surplus/unit/matched_courses as-is (renamed to the allocated_*
// column names) and adds a fixed note that recalculation is deferred. This
// matches allocationEngine.ts's own allocateOptionRequirements, which
// explicitly excludes theme_minimum from exclusive assignment for the same
// reason ("Tim never gives it its own exclusive assignment in this method").
//
// Since AllocationEngine performs no exclusive assignment for theme_minimum,
// there is no allocation-derived signal to recompute from without
// reintroducing resolver-based theme membership logic Tim's own post-
// allocation step does not use either. Reusing the pre-allocation completed
// value here is therefore Tim parity, not a shortcut: it is not "faking"
// completion, it is Tim's actual, current, intentional behavior. (Contrast
// with TASK G's guidance not to reuse pre-allocation completed for ordinary
// requirements, where Tim DOES recompute from allocation.)
//
// preRow.status is always a valid AuditRequirementStatus here:
// SpecializationAuditor's theme_minimum handler (auditThemeMinimum) always
// produces status via createSpecializationAuditRow's satisfied/partial/
// missing helper, never 'review' — only createManualReviewRow does that, and
// those rows are intercepted earlier in buildAllocatedSpecializationAudit.
function buildThemeMinimumPassthrough(preRow: SpecializationAuditRow): SpecializationRequirementResult {
    const notes = preRow.notes
        ? `${preRow.notes} Theme minimum allocation recalculation deferred; pre-allocation match preserved (matches Tim's _allocated_theme_minimum_row placeholder).`
        : "Theme minimum allocation recalculation deferred; pre-allocation match preserved (matches Tim's _allocated_theme_minimum_row placeholder)."

    return {
        group_id: preRow.group_id,
        requirement_area: preRow.requirement_area,
        option_id: preRow.option_id as OptionId | null,
        option_name: preRow.option_name,
        theme: preRow.theme,
        label: preRow.label,
        rule_type: preRow.rule_type,
        status: preRow.status as AuditRequirementStatus,
        completed: preRow.completed,
        required: preRow.required,
        remaining: preRow.remaining,
        surplus: preRow.surplus,
        unit: preRow.unit,
        allocated_courses: preRow.matched_courses,
        allocation_notes: notes,
    }
}

// ---------------------------------------------------------------------------
// Generic preserved passthrough (Tim's final `else` branch)
// ---------------------------------------------------------------------------
//
// Reached only for a row whose bucket does not resolve to
// core/tools/option/complementary at all (e.g. an unrecognized calendar
// config, or a rule_type this auditor doesn't yet classify into a bucket).
// Not currently reachable for any row SpecializationAuditor.ts actually
// emits, but preserved for Tim parity and forward-compatibility. Reuses the
// same status-safety reasoning as buildThemeMinimumPassthrough: manual-review
// rows are always intercepted earlier, so preRow.status here is always a
// valid AuditRequirementStatus.
function buildPreservedPassthrough(preRow: SpecializationAuditRow): SpecializationRequirementResult {
    return {
        group_id: preRow.group_id,
        requirement_area: preRow.requirement_area,
        option_id: preRow.option_id as OptionId | null,
        option_name: preRow.option_name,
        theme: preRow.theme,
        label: preRow.label,
        rule_type: preRow.rule_type,
        status: preRow.status as AuditRequirementStatus,
        completed: preRow.completed,
        required: preRow.required,
        remaining: preRow.remaining,
        surplus: preRow.surplus,
        unit: preRow.unit,
        allocated_courses: preRow.matched_courses,
        allocation_notes: 'No allocation-specific recalculation for this row.',
    }
}

// ---------------------------------------------------------------------------
// TASK B / C / D — Canonical bucket rows (Tools / Option total / Complementary)
// ---------------------------------------------------------------------------

// Mirrors Tim's _allocated_credit_bucket_row (used for both the canonical
// Option-total-credits row and the canonical Complementary-Studies-credits
// row). completed sums attempt.credits over EVERY row counted for the
// bucket — no dedup by course code, matching Tim's `matched["credits"].sum()`
// with no drop_duplicates: two distinct attempts of the same course, both
// allocated into this bucket, both contribute their own credits. Only the
// displayed allocated_courses list is deduped to distinct course codes
// (matching Tim's _course_list).
function buildAllocatedCreditBucketRow(
    preRow: SpecializationAuditRow,
    allocationRows: AllocationWorkingRow[],
    bucket: string,
    orderedConfig: AllocationConfigRule[]
): SpecializationRequirementResult {
    const matched = rowsForBucket(allocationRows, bucket, orderedConfig)
    const completed = matched.reduce((total, row) => total + row.attempt.credits, 0)

    return buildResult(
        preRow,
        completed,
        preRow.required,
        'credits',
        distinctCourseCodes(matched),
        `Post-allocation credit bucket for ${bucketDisplayName(bucket, orderedConfig)}.`
    )
}

// Mirrors Tim's _allocated_course_bucket_row (used for the canonical Tools
// Elective total row). completed is the distinct allocated course count —
// already uncapped in Tim (no min() against required here, unlike his
// _allocated_specific_group_row), so this already matches the frontend's
// intentional uncapped-completed presentation without needing any deviation.
function buildAllocatedCourseBucketRow(
    preRow: SpecializationAuditRow,
    allocationRows: AllocationWorkingRow[],
    bucket: string,
    orderedConfig: AllocationConfigRule[]
): SpecializationRequirementResult {
    const matched = rowsForBucket(allocationRows, bucket, orderedConfig)
    const allocatedCourses = distinctCourseCodes(matched)

    return buildResult(
        preRow,
        allocatedCourses.length,
        preRow.required,
        'course',
        allocatedCourses,
        `Post-allocation course bucket for ${bucketDisplayName(bucket, orderedConfig)}.`
    )
}

// ---------------------------------------------------------------------------
// TASK A — Ordinary Core / option-specific requirement groups
// ---------------------------------------------------------------------------

// Mirrors Tim's _allocated_specific_group_row exactly for ELIGIBILITY
// (course selection), while deliberately diverging for the final completed
// number's capping (see buildResult's docstring / the module-level "IMPORTANT
// FRONTEND DECISION" note).
//
// Three-tier course match, concatenated then deduped by course code
// (Tim's `.drop_duplicates(subset=["effective_course_code"])`), first
// occurrence wins:
//   1. exact_group_match: exclusive_group_id === this exact group_id.
//   2. double_group_match: double_count_allowed rows whose double_count_groups
//      lists this exact group_id (currently unreachable in practice — see the
//      "Double-count helpers" note above — but implemented for parity).
//   3. bucket_match: rows exclusively assigned to this requirement's bucket
//      but to a DIFFERENT group_id — i.e. a course consumed by another
//      specific requirement in the same bucket. Tim still lets these count
//      toward this requirement IF the course also appears in this
//      requirement's own eligible course list (get_group_course_codes),
//      via filter_courses_by_eligible_codes. When the group has an EMPTY
//      eligible list, Tim's `if eligible_courses:` guard skips the filter
//      entirely and every other bucket-assigned course would count — that
//      degenerate case cannot occur here because it only ever arises for
//      manual-review groups, which are intercepted before this function runs
//      (see buildManualReviewResult).
//
// completed for unit === 'credits' sums attempt.credits over the deduped
// match set (Tim: same, after his drop_duplicates). completed for unit ===
// 'course' is the deduped match count, UNCAPPED — Tim caps this at `required`
// (`min(count, required)`); this frontend intentionally does not, per the
// established uncapped-completed/surplus presentation semantics.
function buildAllocatedSpecificGroupRow(
    preRow: SpecializationAuditRow,
    allocationRows: AllocationWorkingRow[],
    bucket: string,
    resolver: SpecializationRequirementResolver
): SpecializationRequirementResult {
    const groupId = preRow.group_id.trim()

    if (!groupId) {
        return buildResult(
            preRow,
            0,
            preRow.required,
            preRow.unit,
            [],
            'No group_id available for post-allocation recalculation.'
        )
    }

    const eligibleCourses = resolver.getGroupCourseCodes(groupId)

    const exactGroupMatch = allocationRows.filter((row) => row.exclusive_group_id.trim() === groupId)
    const doubleGroupMatch = allocationRows.filter((row) => doubleCountsTowardGroup(row, groupId))

    let bucketMatch = allocationRows.filter(
        (row) => row.exclusive_bucket.trim() === bucket && row.exclusive_group_id.trim() !== groupId
    )

    if (eligibleCourses.length > 0) {
        bucketMatch = bucketMatch.filter((row) => resolver.courseMatchesAnyEligible(row.course_code, eligibleCourses))
    }

    const matched = dedupeByCourseCode([...exactGroupMatch, ...doubleGroupMatch, ...bucketMatch])

    const completed =
        preRow.unit === 'credits' ? matched.reduce((total, row) => total + row.attempt.credits, 0) : matched.length

    return buildResult(
        preRow,
        completed,
        preRow.required,
        preRow.unit,
        matched.map((row) => row.course_code),
        'Post-allocation recalculation for specific requirement group. Explicit group and double-count matches are counted before formal bucket eligibility filtering.'
    )
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// TypeScript equivalent of Tim's AllocationEngine.build_allocated_specialization_audit.
//
// Takes the pre-allocation SpecializationAuditRow[] (SpecializationAuditor.ts)
// and the post-allocation AllocationWorkingRow[] working set
// (allocationEngine.ts's allocateCourses), and returns exactly one
// SpecializationRequirementResult per pre-allocation row — same count, same
// order, no filtering, no splitting/merging. allocationConfigs + resolver are
// threaded through only to resolve each row's bucket and canonical rule types
// (Tim's resolver.bucket_for_row / rule_types_for_bucket) and, for ordinary
// requirement groups, that group's own eligible course list
// (resolver.getGroupCourseCodes) — the same "possible matches already
// resolved upstream" simplification allocationEngine.ts already uses
// elsewhere (see its getEligibleUnallocatedRowsForRequirement docstring).
//
// Does not mutate preAllocationRows or allocationRows.
export function buildAllocatedSpecializationAudit(
    preAllocationRows: SpecializationAuditRow[],
    allocationRows: AllocationWorkingRow[],
    allocationConfigs: AllocationConfigs,
    resolver: SpecializationRequirementResolver
): SpecializationRequirementResult[] {
    const orderedConfig = getOrderedAllocationConfig(allocationConfigs, resolver)

    return preAllocationRows.map((preRow) => {
        if (preRow.status === 'review' || preRow.rule_type === 'course_list_review') {
            return buildManualReviewResult(preRow)
        }

        const bucket = resolveBucketForAuditRow(preRow, orderedConfig)
        const canonicalTypes = bucket ? canonicalRuleTypesForBucket(bucket, orderedConfig) : []

        if (bucket === 'option' && canonicalTypes.includes(preRow.rule_type)) {
            return buildAllocatedCreditBucketRow(preRow, allocationRows, bucket, orderedConfig)
        }

        if (bucket === 'tools' && canonicalTypes.includes(preRow.rule_type)) {
            return buildAllocatedCourseBucketRow(preRow, allocationRows, bucket, orderedConfig)
        }

        if (bucket === 'complementary' && canonicalTypes.includes(preRow.rule_type)) {
            return buildAllocatedCreditBucketRow(preRow, allocationRows, bucket, orderedConfig)
        }

        if (preRow.rule_type === 'theme_minimum') {
            return buildThemeMinimumPassthrough(preRow)
        }

        if (bucket === 'core' || bucket === 'option') {
            return buildAllocatedSpecificGroupRow(preRow, allocationRows, bucket, resolver)
        }

        return buildPreservedPassthrough(preRow)
    })
}
