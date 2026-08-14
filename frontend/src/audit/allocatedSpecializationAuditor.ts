import type { AllocationConfigRule, AllocationConfigs } from '../types/auditRules'
import type { AuditProgressUnit, AuditRequirementStatus, SpecializationRequirementResult } from '../types/audit'
import type { OptionId } from '../utils/setupOptions'

import type { SpecializationAuditRow } from './specializationAuditor'
import type { AllocationWorkingRow } from './allocationEngine'
import { getOrderedAllocationConfig, splitSemicolonList } from './allocationEngine'
import type { SpecializationRequirementResolver } from './specializationRequirementResolver'

// ---------------------------------------------------------------------------
// Post-allocation specialization rebuild +
// Bucket resolution helpers
// ---------------------------------------------------------------------------

// Resolves the bucket for a specialization audit row.
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

function computeStatus(required: number, completed: number): AuditRequirementStatus {
    if (completed >= required) return 'satisfied'
    if (completed > 0) return 'partial'
    return 'missing'
}
// Build a SpecializationRequirementResult from a pre-allocation row and post-allocation data.
// This is the main result-building helper for ordinary requirement groups (core, option, complementary). 
// It caps remaining/surplus at 0, but does not cap completed
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
//  Manual review rows
// ---------------------------------------------------------------------------

// Builds a SpecializationRequirementResult for a manual-review row. 
// This is used for rows that require human review and are not evaluated by the automated allocation process. 
// The status is set to 'not_applicable', and all counts are set to 0.
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
// Theme minimum 
// ---------------------------------------------------------------------------

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
// Generic preserved passthrough
// ---------------------------------------------------------------------------

// Preserves the pre-allocation row's counts and matched courses, with a note indicating that no allocation-specific recalculation was performed. 
// This is used for rows that do not fall into any of the other categories (manual review, theme minimum, or ordinary requirement groups).
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
// Bucket-level rows (Tools, Option, Complementary)
// ---------------------------------------------------------------------------

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
// Ordinary Core / option-specific requirement groups
// ---------------------------------------------------------------------------

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
