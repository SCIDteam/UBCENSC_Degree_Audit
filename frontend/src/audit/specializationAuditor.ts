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

    const aoc_row = auditCanonicalAreaOfConcentration({
        applicable_groups,
        resolver,
        counted_course_plan,
        student_profile
    })

    if (aoc_row) {
        rows.push(aoc_row)
    }

    for (const group of applicable_groups) {
        if (group.requirement_area === 'Tools Elective') {
            // Raw Tools Elective groups (rule_type: choose_n) are aggregated
            // into a single canonical tools_elective_total row below, not
            // emitted individually. See auditCanonicalToolsRequirement.
            continue
        }

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

    const tools_groups = resolver.getGroupsByRequirementArea('Tools Elective')

    const tools_row = auditCanonicalToolsRequirement({
        tools_groups,
        resolver,
        counted_course_plan
    })

    if (tools_row) {
        rows.push(tools_row)
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

interface AuditCanonicalToolsRequirementProps {
    tools_groups: SpecializationRequirementGroup[]
    resolver: SpecializationRequirementResolver
    counted_course_plan: CourseAttempt[]
}

// Handler for the canonical Tools Elective requirement. Mirrors Tim's
// _audit_canonical_tools_elective: all applicable raw Tools Elective groups
// (requirement_area === "Tools Elective", rule_type === "choose_n") are
// aggregated into ONE synthetic tools_elective_total row instead of being
// emitted individually, since a program may split the same overall Tools
// requirement across multiple raw rows (e.g. by year level).
function auditCanonicalToolsRequirement({
    tools_groups,
    resolver,
    counted_course_plan
}: AuditCanonicalToolsRequirementProps): SpecializationAuditRow | null {
    if (tools_groups.length === 0) {
        return null
    }

    const required = resolveToolsRequiredCourseCount(tools_groups)

    const group_ids = tools_groups.map((group) => group.group_id)
    const eligible_course_codes = resolver.getCourseCodesForGroups(group_ids)

    const matched_courses = matchDistinctCourses(
        counted_course_plan,
        eligible_course_codes,
        resolver
    )

    const completed = matched_courses.length

    const synthetic_group = makeCanonicalToolsGroup(tools_groups[0])

    return createSpecializationAuditRow({
        group: synthetic_group,
        rule_type: 'tools_elective_total',
        completed,
        required,
        unit: 'course',
        matched_courses,
        notes: ''
    })
}

// Mirrors Tim's _resolve_tools_required_course_count: the required course
// count is the MAXIMUM positive rule_value across applicable Tools rows
// (not a sum, since multiple raw rows can represent the same overall
// requirement split by year level). Falls back to total credits / 3, then 1.
function resolveToolsRequiredCourseCount(
    tools_groups: SpecializationRequirementGroup[]
): number {
    const positive_rule_values = tools_groups
        .map((group) => group.rule_value)
        .filter(
            (value): value is number =>
                typeof value === 'number' && Number.isFinite(value) && value > 0
        )

    if (positive_rule_values.length > 0) {
        return Math.max(...positive_rule_values)
    }

    const numeric_credits = tools_groups
        .map((group) => group.credits)
        .filter(
            (value): value is number =>
                typeof value === 'number' && Number.isFinite(value)
        )

    if (numeric_credits.length > 0) {
        const total_credits = numeric_credits.reduce((sum, value) => sum + value, 0)
        return total_credits / 3
    }

    return 1
}

// Mirrors Tim's _make_synthetic_group for the Tools Elective canonical row.
// Uses a deterministic representative group (the first applicable Tools
// group in source order) for the program/calendar_year/program_type that
// make up the synthetic group_id.
function makeCanonicalToolsGroup(
    representative_group: SpecializationRequirementGroup
): SpecializationRequirementGroup {
    const program = representative_group.program.trim().toUpperCase()
    const calendar_year = representative_group.calendar_year.trim()
    const program_type = representative_group.program_type.trim().toUpperCase()

    const group_id = `${program}_${calendar_year}_${program_type}_TOOLS_ELECTIVE_CANONICAL_TOTAL`
        .replaceAll('-', '_')
        .replaceAll(' ', '_')
        .toUpperCase()

    return {
        group_id,
        program,
        calendar_year,
        program_type,
        year_level: null,
        requirement_area: 'Tools Elective',
        option_id: null,
        option_name: null,
        option_name_raw: null,
        theme: null,
        is_recommended: false,
        label: 'Tools Elective total',
        credits: null,
        rule_type: 'tools_elective_total',
        rule_value: null,
        rule_subject: null,
        include_pattern: null,
        exclude_pattern: null,
        rule_unit: 'course',
        source_text: '',
        unit: 'course'
    }
}

interface CanonicalAreaOfConcentrationResolution {
    requiredCredits: number
    sourceGroups: SpecializationRequirementGroup[]
}

function isValidCredits(value: number | null): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

// Mirrors Tim's _resolve_canonical_aoc_credit_requirement precedence:
// 1. option-specific option_minimum_credits rows (max credits)
// 2. generic (no option_id) option_minimum_credits rows (max credits)
// 3. area_of_concentration_credits rows (summed credits)
// Only rows with numeric credits are considered at each tier.
function resolveCanonicalAreaOfConcentrationCreditRequirement(
    applicable_groups: SpecializationRequirementGroup[],
    student_profile: StudentSetupProfile
): CanonicalAreaOfConcentrationResolution | null {
    const profile_option_id = (student_profile.option_id ?? '').trim().toUpperCase()

    const aoc_groups = applicable_groups.filter(
        (group) => group.requirement_area === 'Area of Concentration'
    )

    const option_specific = aoc_groups.filter((group) => {
        if (group.rule_type !== 'option_minimum_credits') return false
        if (!isValidCredits(group.credits)) return false
        const group_option_id = (group.option_id ?? '').trim().toUpperCase()
        return group_option_id !== '' && group_option_id === profile_option_id
    })

    if (option_specific.length > 0) {
        return {
            requiredCredits: Math.max(...option_specific.map((group) => group.credits as number)),
            sourceGroups: option_specific
        }
    }

    const generic = aoc_groups.filter((group) => {
        if (group.rule_type !== 'option_minimum_credits') return false
        if (!isValidCredits(group.credits)) return false
        return (group.option_id ?? '').trim() === ''
    })

    if (generic.length > 0) {
        return {
            requiredCredits: Math.max(...generic.map((group) => group.credits as number)),
            sourceGroups: generic
        }
    }

    const area_credits_rows = aoc_groups.filter(
        (group) => group.rule_type === 'area_of_concentration_credits' && isValidCredits(group.credits)
    )

    if (area_credits_rows.length > 0) {
        return {
            requiredCredits: area_credits_rows.reduce((sum, group) => sum + (group.credits as number), 0),
            sourceGroups: area_credits_rows
        }
    }

    return null
}

// Mirrors Tim's _get_selected_option_name: first non-empty option_name
// among applicable groups matching the selected option_id.
function getSelectedAreaOfConcentrationOptionName(
    applicable_groups: SpecializationRequirementGroup[],
    option_id: string
): string {
    if (!option_id) {
        return ''
    }

    const normalized_option_id = option_id.trim().toUpperCase()

    for (const group of applicable_groups) {
        const group_option_id = (group.option_id ?? '').trim().toUpperCase()

        if (group_option_id !== normalized_option_id) {
            continue
        }

        const option_name = (group.option_name ?? '').trim()

        if (option_name !== '') {
            return option_name
        }
    }

    return ''
}

function matchAreaOfConcentrationCourses(
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

// Mirrors Tim's _make_synthetic_group for the canonical Area of
// Concentration row. Program/calendar_year/program_type are taken from a
// representative source group (the first resolved source row), which is
// equivalent to using the student profile directly since source rows are
// already filtered to match the profile.
function makeCanonicalAreaOfConcentrationGroup(
    representative_group: SpecializationRequirementGroup,
    suffix: string,
    option_id: string | null,
    option_name: string | null
): SpecializationRequirementGroup {
    const program = representative_group.program.trim().toUpperCase()
    const calendar_year = representative_group.calendar_year.trim()
    const program_type = representative_group.program_type.trim().toUpperCase()

    const group_id = `${program}_${calendar_year}_${program_type}_${suffix}`
        .replaceAll('-', '_')
        .replaceAll(' ', '_')
        .toUpperCase()

    return {
        group_id,
        program,
        calendar_year,
        program_type,
        year_level: null,
        requirement_area: 'Area of Concentration',
        option_id,
        option_name,
        option_name_raw: null,
        theme: null,
        is_recommended: false,
        label: 'Area of Concentration total credits',
        credits: null,
        rule_type: 'option_total_credits',
        rule_value: null,
        rule_subject: null,
        include_pattern: null,
        exclude_pattern: null,
        rule_unit: 'credits',
        source_text: '',
        unit: 'credits'
    }
}

interface AuditCanonicalAreaOfConcentrationProps {
    applicable_groups: SpecializationRequirementGroup[]
    resolver: SpecializationRequirementResolver
    counted_course_plan: CourseAttempt[]
    student_profile: StudentSetupProfile
}

// Handler for the canonical Area of Concentration requirement. Mirrors
// Tim's _audit_canonical_aoc_minimum: raw AoC metadata rows
// (option_minimum_credits, area_of_concentration_credits) are resolved into
// a single required-credit target via
// resolveCanonicalAreaOfConcentrationCreditRequirement's precedence, then
// matched against the student's selected option's full eligible-course
// universe. That universe intentionally includes recommended-course rows
// (see getOptionEligibleCourseCodes), even though recommended groups are
// themselves excluded from the visible/audited requirement-group list.
function auditCanonicalAreaOfConcentration({
    applicable_groups,
    resolver,
    counted_course_plan,
    student_profile
}: AuditCanonicalAreaOfConcentrationProps): SpecializationAuditRow | null {
    const resolved = resolveCanonicalAreaOfConcentrationCreditRequirement(applicable_groups, student_profile)

    if (resolved === null) {
        return null
    }

    const option_id = (student_profile.option_id ?? '').trim()
    const representative_group = resolved.sourceGroups[0]

    if (!option_id) {
        const synthetic_group = makeCanonicalAreaOfConcentrationGroup(
            representative_group,
            'AOC_NO_OPTION_CANONICAL_TOTAL_CREDITS',
            null,
            null
        )

        return createSpecializationAuditRow({
            group: synthetic_group,
            rule_type: 'option_total_credits',
            completed: 0,
            required: resolved.requiredCredits,
            unit: 'credits',
            matched_courses: [],
            notes: ''
        })
    }

    if (resolved.requiredCredits <= 0) {
        return null
    }

    const option_name = getSelectedAreaOfConcentrationOptionName(applicable_groups, option_id)
    const eligible_course_codes = resolver.getOptionEligibleCourseCodes(option_id)

    const matched = matchAreaOfConcentrationCourses(counted_course_plan, eligible_course_codes, resolver)
    const matched_courses = matched.map((course) => course.course_code)
    const completed = matched.reduce((sum, course) => sum + course.credits, 0)

    const synthetic_group = makeCanonicalAreaOfConcentrationGroup(
        representative_group,
        `AOC_${option_id}_CANONICAL_TOTAL_CREDITS`,
        option_id,
        option_name || null
    )

    return createSpecializationAuditRow({
        group: synthetic_group,
        rule_type: 'option_total_credits',
        completed,
        required: resolved.requiredCredits,
        unit: 'credits',
        matched_courses,
        notes: ''
    })
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
