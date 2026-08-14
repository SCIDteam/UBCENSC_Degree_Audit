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
