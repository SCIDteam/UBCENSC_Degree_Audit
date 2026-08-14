import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type {
    SpecializationRequirementGroup,
    SpecializationRequirementCourse
} from '../types/auditRules'
import type {
    AuditProgressUnit,
    AuditRequirementStatus
} from '../types/audit'

import { SpecializationRequirementResolver } from './specializationRequirementResolver'

// Internal pre-allocation specialization audit row.
//
// This is distinct from the public SpecializationRequirementResult contract
// (types/audit.ts), which represents Tim's final, post-allocation result and
// uses allocated_courses (exclusive assignments). Rows here represent
// possible matches only, prior to the AllocationEngine's exclusive
// assignment pass.
export interface SpecializationAuditRow {
    group_id: string
    requirement_area: string
    option_id: string | null
    option_name: string | null
    theme?: string
    label: string
    rule_type: string
    status: AuditRequirementStatus
    completed: number
    required: number
    remaining: number
    surplus: number
    unit: AuditProgressUnit
    matched_courses: string[]
    notes: string
}

interface SpecializationAuditorProps {
    classified_courses: CatalogueCourse[]
    specialization_requirement_groups: SpecializationRequirementGroup[]
    specialization_requirement_courses: SpecializationRequirementCourse[]
    student_course_plan: CourseAttempt[]
    student_profile: StudentSetupProfile
}

// Rule types audited by this slice. All other rule types are skipped
// entirely (no row emitted) until their own auditors are implemented.
const SUPPORTED_RULE_TYPES = new Set([
    'required_course',
    'required_all',
    'choose_n',
    'level_requirement',
    'complementary_studies_credits',
])

export function SpecializationAuditor({
    specialization_requirement_groups,
    specialization_requirement_courses,
    student_course_plan,
    student_profile
}: SpecializationAuditorProps): SpecializationAuditRow[] {
    const counted_course_plan = filterCountedCourses(student_course_plan)

    const resolver = new SpecializationRequirementResolver({
        requirementGroups: specialization_requirement_groups,
        requirementCourses: specialization_requirement_courses,
        studentProfile: student_profile
    })

    const applicable_groups = resolver.getApplicableRequirementGroups()

    const rows: SpecializationAuditRow[] = []

    for (const group of applicable_groups) {
        const rule_type = (group.rule_type ?? '').trim()

        if (!SUPPORTED_RULE_TYPES.has(rule_type)) {
            continue
        }

        if (rule_type === 'level_requirement') {
            rows.push(
                auditLevelRequirement({
                    group,
                    resolver,
                    counted_course_plan
                })
            )
            continue
        }

        if (rule_type === 'complementary_studies_credits') {
            const row = auditComplementaryStudiesCredits({
                group,
                resolver,
                counted_course_plan
            })

            if (row) {
                rows.push(row)
            }
            continue
        }

        rows.push(
            auditCourseGroup({
                group,
                resolver,
                counted_course_plan
            })
        )
    }

    return rows
}

// Matches Tim's specialization_auditor.py _filter_counted_courses, and the
// unexported filterCountedCourses in runAudit.ts. Duplicated locally here
// per this task's constraint of not modifying runAudit.ts.
function filterCountedCourses(
    student_course_plan: CourseAttempt[]
): CourseAttempt[] {
    return student_course_plan.filter(
        (attempt) =>
            attempt.status === 'planned' ||
            attempt.status === 'in_progress' ||
            (attempt.status === 'completed' && attempt.grade === 'P')
    )
}

interface AuditCourseGroupProps {
    group: SpecializationRequirementGroup
    resolver: SpecializationRequirementResolver
    counted_course_plan: CourseAttempt[]
}

// Shared handler for required_course, required_all, and choose_n rule
// types. Mirrors Tim's _audit_course_group.
function auditCourseGroup({
    group,
    resolver,
    counted_course_plan
}: AuditCourseGroupProps): SpecializationAuditRow {
    const eligible_course_codes = resolver.getGroupCourseCodes(group.group_id)

    const matched_courses = matchDistinctCourses(
        counted_course_plan,
        eligible_course_codes,
        resolver
    )

    const rule_type = (group.rule_type ?? '').trim()
    const required = getRequiredTarget(rule_type, group, eligible_course_codes)
    const completed = matched_courses.length

    return createSpecializationAuditRow({
        group,
        rule_type,
        completed,
        required,
        unit: 'course',
        matched_courses,
        notes: ''
    })
}

function matchDistinctCourses(
    counted_course_plan: CourseAttempt[],
    eligible_course_codes: string[],
    resolver: SpecializationRequirementResolver
): string[] {
    const seen = new Set<string>()
    const matched: string[] = []

    for (const attempt of counted_course_plan) {
        if (seen.has(attempt.course_code)) {
            continue
        }

        if (resolver.courseMatchesAnyEligible(attempt.course_code, eligible_course_codes)) {
            seen.add(attempt.course_code)
            matched.push(attempt.course_code)
        }
    }

    return matched
}

interface AuditLevelRequirementProps {
    group: SpecializationRequirementGroup
    resolver: SpecializationRequirementResolver
    counted_course_plan: CourseAttempt[]
}

// Handler for level_requirement. Mirrors Tim's _audit_level_requirement,
// except completed is not capped at required (see module-level notes in
// createSpecializationAuditRow callers): this pre-allocation row preserves
// the full qualifying amount so surplus can be displayed.
function auditLevelRequirement({
    group,
    resolver,
    counted_course_plan
}: AuditLevelRequirementProps): SpecializationAuditRow {
    const matched = matchLevelRequirementCourses(counted_course_plan, group, resolver)
    const matched_courses = matched.map((course) => course.course_code)

    const rule_unit = (group.rule_unit ?? '').trim().toLowerCase()

    let completed: number
    let required: number
    let unit: AuditProgressUnit

    if (rule_unit === 'credits') {
        completed = matched.reduce((sum, course) => sum + course.credits, 0)
        required = typeof group.credits === 'number' && Number.isFinite(group.credits) ? group.credits : 0
        unit = 'credits'
    } else {
        // rule_unit === 'course' (Tim's default branch)
        completed = matched.length
        required = getLevelRequirementCourseTarget(group)
        unit = 'course'
    }

    return createSpecializationAuditRow({
        group,
        rule_type: 'level_requirement',
        completed,
        required,
        unit,
        matched_courses,
        notes: ''
    })
}

function getLevelRequirementCourseTarget(group: SpecializationRequirementGroup): number {
    const rule_value = group.rule_value

    if (typeof rule_value === 'number' && Number.isFinite(rule_value) && rule_value > 0) {
        return rule_value
    }

    return 1
}

function matchLevelRequirementCourses(
    counted_course_plan: CourseAttempt[],
    group: SpecializationRequirementGroup,
    resolver: SpecializationRequirementResolver
): { course_code: string; credits: number }[] {
    const seen = new Set<string>()
    const matched: { course_code: string; credits: number }[] = []

    for (const attempt of counted_course_plan) {
        if (seen.has(attempt.course_code)) {
            continue
        }

        if (resolver.courseMatchesLevelRequirement(attempt.subject, attempt.course_number, group)) {
            seen.add(attempt.course_code)
            matched.push({ course_code: attempt.course_code, credits: attempt.credits })
        }
    }

    return matched
}

interface AuditComplementaryStudiesCreditsProps {
    group: SpecializationRequirementGroup
    resolver: SpecializationRequirementResolver
    counted_course_plan: CourseAttempt[]
}

// Handler for complementary_studies_credits. Mirrors Tim's
// _audit_complementary_studies_credits, which delegates to
// _audit_canonical_credit_requirement: eligible courses come from the
// resolver's complementary-studies eligibility set (not this group's own
// course list), the required target is the group's credits field, and no
// row is emitted when that target is not positive.
function auditComplementaryStudiesCredits({
    group,
    resolver,
    counted_course_plan
}: AuditComplementaryStudiesCreditsProps): SpecializationAuditRow | null {
    const required = typeof group.credits === 'number' && Number.isFinite(group.credits) ? group.credits : 0

    if (required <= 0) {
        return null
    }

    const eligible_course_codes = resolver.getComplementaryStudiesEligibleCourseCodes()

    const matched = matchComplementaryStudiesCourses(
        counted_course_plan,
        eligible_course_codes,
        resolver
    )

    const matched_courses = matched.map((course) => course.course_code)
    const completed = matched.reduce((sum, course) => sum + course.credits, 0)

    return createSpecializationAuditRow({
        group,
        rule_type: 'complementary_studies_credits',
        completed,
        required,
        unit: 'credits',
        matched_courses,
        notes: ''
    })
}

function matchComplementaryStudiesCourses(
    counted_course_plan: CourseAttempt[],
    eligible_course_codes: string[],
    resolver: SpecializationRequirementResolver
): { course_code: string; credits: number }[] {
    const seen = new Set<string>()
    const matched: { course_code: string; credits: number }[] = []

    for (const attempt of counted_course_plan) {
        if (seen.has(attempt.course_code)) {
            continue
        }

        if (resolver.courseMatchesAnyEligible(attempt.course_code, eligible_course_codes)) {
            seen.add(attempt.course_code)
            matched.push({ course_code: attempt.course_code, credits: attempt.credits })
        }
    }

    return matched
}

function getRequiredTarget(
    rule_type: string,
    group: SpecializationRequirementGroup,
    eligible_course_codes: string[]
): number {
    if (rule_type === 'required_course') {
        return 1
    }

    if (rule_type === 'required_all') {
        return new Set(eligible_course_codes).size
    }

    // choose_n
    const rule_value = group.rule_value

    if (typeof rule_value === 'number' && Number.isFinite(rule_value) && rule_value > 0) {
        return rule_value
    }

    return 1
}

interface CreateSpecializationAuditRowProps {
    group: SpecializationRequirementGroup
    rule_type: string
    completed: number
    required: number
    unit: AuditProgressUnit
    matched_courses: string[]
    notes: string
}

function createSpecializationAuditRow({
    group,
    rule_type,
    completed,
    required,
    unit,
    matched_courses,
    notes
}: CreateSpecializationAuditRowProps): SpecializationAuditRow {
    const getRequirementStatus = (required: number, completed: number): AuditRequirementStatus => {
        if (completed >= required) return 'satisfied'
        if (completed > 0) return 'partial'
        return 'missing'
    }

    const remaining = Math.max(required - completed, 0)
    const surplus = Math.max(completed - required, 0)

    return {
        group_id: group.group_id,
        requirement_area: group.requirement_area,
        option_id: group.option_id,
        option_name: group.option_name,
        theme: group.theme || undefined,
        label: group.label,
        rule_type: rule_type,
        status: getRequirementStatus(required, completed),
        completed: completed,
        required: required,
        remaining: remaining,
        surplus: surplus,
        unit: unit,
        matched_courses: matched_courses,
        notes: notes
    }
}
