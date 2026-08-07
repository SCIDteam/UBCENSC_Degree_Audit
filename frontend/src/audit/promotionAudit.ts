import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type {
    PromotionRules
} from '../types/auditRules'
import type { 
    PromotionRequirementResult, 
    AuditProgressUnit, 
    AuditRequirementStatus 
} from '../types/audit'

interface PromotionAuditorProps {
    promotion_target_year: number | null,
    classified_courses: CatalogueCourse[]
    promotionRules: PromotionRules[]
    student_course_plan: CourseAttempt[]
    student_profile: StudentSetupProfile
}

interface RecordPromotionProps {
    promotion_to: string
    rule_id: string
    requirement_area: string
    label: string
    rule_type: string
    completed: number
    required: number
    unit: AuditProgressUnit
    matched_courses: string[]
    notes?: string
}

export function PromotionAuditor({
    promotion_target_year,
    promotionRules,
    student_course_plan
} : PromotionAuditorProps) {
    const promotion_requirement_results : PromotionRequirementResult[] = []

    const requirement_area = 'Promotion';

    promotionRules.map((rule) => {
        if (rule.metric === "min_total_credits") {
            const {
                promotion_minimum,
                total_credits,
                total_notes,
                matched_courses
            } = AuditPromotionMinTotalCredits(
                rule,
                student_course_plan
            )

            promotion_requirement_results.push(
                createPromotionRequirementResult({
                    promotion_to: String(promotion_target_year),
                    rule_id: rule.id,
                    requirement_area: requirement_area,
                    // TODO: Change to user-friendly label
                    label: rule.id,
                    rule_type: rule.metric,
                    completed: total_credits,
                    required: promotion_minimum,
                    unit: 'credits',
                    matched_courses: matched_courses,
                    notes: total_notes
                })
            )
        }
        else if (rule.metric === "min_science_credits") {
            const {
                promotion_science_minimum,
                total_science_credits,
                total_science_notes,
                matched_courses
            } = AuditPromotionMinScienceCredits(
                rule,
                student_course_plan
            )

            promotion_requirement_results.push(
                createPromotionRequirementResult({
                    promotion_to: String(promotion_target_year),
                    rule_id: rule.id,
                    requirement_area: requirement_area,
                    // TODO: Change to user-friendly label
                    label: rule.id,
                    rule_type: rule.metric,
                    completed: total_science_credits,
                    required: promotion_science_minimum,
                    unit: 'credits',
                    matched_courses: matched_courses,
                    notes: total_science_notes
                })
            )
        }
        else if (rule.metric === "min_science_credits_at_level") {
            const {
                required_science_credits_at_level,
                total_science_credits_at_level,
                total_science_at_level_notes,
                matched_courses
            } = AuditPromotionMinScienceCreditsAtLevel(
                rule,
                student_course_plan
            )

            promotion_requirement_results.push(
                createPromotionRequirementResult({
                    promotion_to: String(promotion_target_year),
                    rule_id: rule.id,
                    requirement_area: requirement_area,
                    // TODO: Change to user-friendly label
                    label: rule.id,
                    rule_type: rule.metric,
                    completed: total_science_credits_at_level,
                    required: required_science_credits_at_level,
                    unit: 'credits',
                    matched_courses: matched_courses,
                    notes: total_science_at_level_notes
                })
            )
        }
        else if (rule.metric === "min_science_credits_at_or_above_level") {
            const {
                required_science_credits_at_or_above_level,
                total_science_credits_at_or_above_level,
                science_credits_at_or_above_level_notes,
                matched_courses
            } = AuditPromotionMinScienceCreditsAtOrAboveLevel(
                rule,
                student_course_plan
            )

            promotion_requirement_results.push(
                createPromotionRequirementResult({
                    promotion_to: String(promotion_target_year),
                    rule_id: rule.id,
                    requirement_area: requirement_area,
                    // TODO: Change to user-friendly label
                    label: rule.id,
                    rule_type: rule.metric,
                    completed: total_science_credits_at_or_above_level,
                    required: required_science_credits_at_or_above_level,
                    unit: 'credits',
                    matched_courses: matched_courses,
                    notes: science_credits_at_or_above_level_notes
                })
            )
        }
        else if (rule.metric === "min_upper_level_credits") {
            const {
                required_upper_level_credits,
                total_upper_level_credits,
                upper_level_credits_notes,
                matched_courses
            } = AuditPromotionUpperLevelCredits(
                rule,
                student_course_plan
            )

            promotion_requirement_results.push(
                createPromotionRequirementResult({
                    promotion_to: String(promotion_target_year),
                    rule_id: rule.id,
                    requirement_area: requirement_area,
                    // TODO: Change to user-friendly label
                    label: rule.id,
                    rule_type: rule.metric,
                    completed: total_upper_level_credits,
                    required: required_upper_level_credits,
                    unit: 'credits',
                    matched_courses: matched_courses,
                    notes: upper_level_credits_notes
                })
            )
        }
        else if (rule.metric === "one_lab_course") {
            const {
                required_lab_courses,
                total_lab_courses,
                lab_courses_notes,
                matched_courses
            } = AuditPromotionOneLabCourse(
                rule,
                student_course_plan
            )

            promotion_requirement_results.push(
                createPromotionRequirementResult({
                    promotion_to: String(promotion_target_year),
                    rule_id: rule.id,
                    requirement_area: requirement_area,
                    // TODO: Change to user-friendly label
                    label: rule.id,
                    rule_type: rule.metric,
                    completed: total_lab_courses,
                    required: required_lab_courses,
                    unit: 'course',
                    matched_courses: matched_courses,
                    notes: lab_courses_notes
                })
            )
        }
        else if (rule.metric === "min_communication_credits") {
            const {
                required_min_communication_credits,
                total_communication_credits,
                communication_credits_notes,
                matched_courses
            } = AuditPromotionMinCommunicationCredits(
                rule,
                student_course_plan
            )

            promotion_requirement_results.push(
                createPromotionRequirementResult({
                    promotion_to: String(promotion_target_year),
                    rule_id: rule.id,
                    requirement_area: requirement_area,
                    // TODO: Change to user-friendly label
                    label: rule.id,
                    rule_type: rule.metric,
                    completed: total_communication_credits,
                    required: required_min_communication_credits,
                    unit: 'credits',
                    matched_courses: matched_courses,
                    notes: communication_credits_notes
                })
            )
        }
    });

    return promotion_requirement_results;
}

// Mirrors facultyAuditor.ts's uniqueCourseCodes helper (duplicated rather than
// imported to keep this file's changes scoped to Promotion; Tim's Python
// equivalent is PromotionAuditor._course_list, which dedupes
// effective_course_code via pandas drop_duplicates() preserving first
// occurrence). The frontend has no effective/override course code on
// CourseAttempt, so course_code is the best available field.
function uniqueCourseCodes(courses: CourseAttempt[]): string[] {
    const seen = new Set<string>();
    const codes: string[] = [];

    for (const course of courses) {
        if (!seen.has(course.course_code)) {
            seen.add(course.course_code);
            codes.push(course.course_code);
        }
    }

    return codes;
}

// Mirrors PromotionAuditor._rule_level_min: blank/unparseable -> 0.
function ruleLevelMin(value: string): number {
    if (value === '') return 0;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

// Mirrors PromotionAuditor._rule_level_max: blank/unparseable -> 999.
function ruleLevelMax(value: string): number {
    if (value === '') return 999;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 999 : parsed;
}

// Mirrors pd.to_numeric(courses["course_number"], errors="coerce"): unparseable -> NaN,
// which then fails any between() comparison.
function parseCourseNumber(value: string): number {
    return Number(value);
}

function createPromotionRequirementResult({
    promotion_to,
    rule_id,
    requirement_area,
    label,
    rule_type,
    completed,
    required,
    unit,
    matched_courses,
    notes
} : RecordPromotionProps) {
    const getRequirementStatus = (required: number, completed: number): AuditRequirementStatus => {
        if (completed >= required) return "satisfied"
        if (completed > 0) return "partial"
        return "missing"
    }

    const surplus = Math.max(completed-required, 0);
    const remaining = Math.max(required-completed, 0);

    const result: PromotionRequirementResult = {
        promotion_to: promotion_to,
        rule_id: rule_id,
        requirement_area: requirement_area,
        label: label,
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

    return result
}
function AuditPromotionMinTotalCredits(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total promotion rules credits.
    const promotion_minimum = rule?.value ?? 0;

    // All counted courses contribute to total credits.
    const matchedCourses = student_course_plan;

    const total_credits = matchedCourses.reduce(
        (accm, cur) => accm + cur.credits, 0
    );

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const total_notes = ``

    return {promotion_minimum, total_credits, total_notes, matched_courses}
}

function AuditPromotionMinScienceCredits(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits.
    const promotion_science_minimum = rule?.value ?? 0;

    const matchedCourses = student_course_plan
        .filter((course) => course.is_science_credit)

    const total_science_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0);

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const total_science_notes = rule.notes;

    return {promotion_science_minimum, total_science_credits, total_science_notes, matched_courses}
}

function AuditPromotionMinScienceCreditsAtLevel(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_science_credits_at_level = rule?.value ?? 0;

    const level_min = ruleLevelMin(rule?.course_level_min ?? '');
    const level_max = ruleLevelMax(rule?.course_level_max ?? '');

    const matchedCourses = student_course_plan
        .filter((course) => {
            const course_number = parseCourseNumber(course.course_number);
            return (
                course.is_science_credit &&
                course_number >= level_min &&
                course_number <= level_max
            )
        })

    const total_science_credits_at_level = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0);

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const total_science_at_level_notes = rule.notes;

    return {required_science_credits_at_level, total_science_credits_at_level, total_science_at_level_notes, matched_courses}
}

function AuditPromotionMinScienceCreditsAtOrAboveLevel(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_science_credits_at_or_above_level = rule?.value ?? 0;

    const level_min = ruleLevelMin(rule?.course_level_min ?? '');
    const level_max = ruleLevelMax(rule?.course_level_max ?? '');

    // Tim's Python implements this identically to at_level (same between()
    // filter); "at or above" rules rely on course_level_max being left blank
    // in the rule data, which defaults level_max to 999.
    const matchedCourses = student_course_plan
        .filter((course) => {
            const course_number = parseCourseNumber(course.course_number);
            return (
                course.is_science_credit &&
                course_number >= level_min &&
                course_number <= level_max
            )
        })

    const total_science_credits_at_or_above_level = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0);

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const science_credits_at_or_above_level_notes = rule.notes;

    return {
        required_science_credits_at_or_above_level,
        total_science_credits_at_or_above_level,
        science_credits_at_or_above_level_notes,
        matched_courses
    }
}

function AuditPromotionUpperLevelCredits(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_upper_level_credits = rule?.value ?? 0;

    const level_min = ruleLevelMin(rule?.course_level_min ?? '');
    const level_max = ruleLevelMax(rule?.course_level_max ?? '');

    const matchedCourses = student_course_plan
        .filter((course) => {
            const course_number = parseCourseNumber(course.course_number);
            return (
                course_number >= level_min &&
                course_number <= level_max
            )
        })

    const total_upper_level_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0);

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const upper_level_credits_notes = rule.notes;

    return {
        required_upper_level_credits,
        total_upper_level_credits,
        upper_level_credits_notes,
        matched_courses
    }
}

function AuditPromotionOneLabCourse(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Counts distinct eligible lab courses (Tim dedupes effective_course_code
    // before counting, not raw attempts).
    const required_lab_courses = rule?.value ?? 0;

    const matchedCourses = student_course_plan
        .filter((course) => course.is_lab_course)

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const total_lab_courses = matched_courses.length

    const lab_courses_notes = rule.notes;

    return {
        required_lab_courses,
        total_lab_courses,
        lab_courses_notes,
        matched_courses
    }
}

function AuditPromotionMinCommunicationCredits(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_min_communication_credits = rule?.value ?? 0;

    const matchedCourses = student_course_plan
        .filter((course) => course.is_communication_course)

    const total_communication_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0);

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const communication_credits_notes = rule.notes;

    return {
        required_min_communication_credits,
        total_communication_credits,
        communication_credits_notes,
        matched_courses
    }
}