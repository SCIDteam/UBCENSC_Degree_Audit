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

    // TEMPORARY - NEED TO FIGURE OUT PURPOSE
    const matched_courses: string[] = [];
    const requirement_area = 'Promotion';

    promotionRules.map((rule) => {
        if (rule.metric === "min_total_credits") {
            const {
                promotion_minimum, 
                total_credits, 
                total_notes
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
                total_science_notes
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
                total_science_at_level_notes
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
                science_credits_at_or_above_level_notes
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
                upper_level_credits_notes
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
                lab_courses_notes
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
                    unit: 'credits',
                    matched_courses: matched_courses,
                    notes: lab_courses_notes
                })
            )
        }
        else if (rule.metric === "min_communication_credits") {
            const {
                required_min_communication_credits, 
                total_communication_credits, 
                communication_credits_notes
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

    const total_credits = student_course_plan.reduce(
        (accm, cur) => accm + cur.credits, 0
    );

    const total_notes = ``

    return {promotion_minimum, total_credits, total_notes}
}

function AuditPromotionMinScienceCredits(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits.
    const promotion_science_minimum = rule?.value ?? 0;

    const total_science_credits = student_course_plan
        .filter((course) => course.is_science_credit)
        .reduce((accm, cur) => accm + cur.credits, 0);

    const total_science_notes = rule.notes;

    return {promotion_science_minimum, total_science_credits, total_science_notes}
}

function AuditPromotionMinScienceCreditsAtLevel(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_science_credits_at_level = rule?.value ?? 0;

    const level_min = rule?.course_level_min ?? 0;
    const level_max = rule?.course_level_max ?? 0;

    const total_science_credits_at_level = student_course_plan
        .filter((course) => {
            course.is_science_credit && 
            course.course_number >= level_min &&
            course.course_number <= level_max
        })
        .reduce((accm, cur) => accm + cur.credits, 0);

    const total_science_at_level_notes = rule.notes;

    return {required_science_credits_at_level, total_science_credits_at_level, total_science_at_level_notes}
}

function AuditPromotionMinScienceCreditsAtOrAboveLevel(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_science_credits_at_or_above_level = rule?.value ?? 0;

    const level_min = rule?.course_level_min ?? 0;
    const level_max = rule?.course_level_max ?? 0;

    // TODO: Verify logic
    const total_science_credits_at_or_above_level = student_course_plan
        .filter((course) => {
            course.is_science_credit && 
            course.course_number >= level_min &&
            course.course_number <= level_max
        })
        .reduce((accm, cur) => accm + cur.credits, 0);

    const science_credits_at_or_above_level_notes = rule.notes;

    return {
        required_science_credits_at_or_above_level, 
        total_science_credits_at_or_above_level, 
        science_credits_at_or_above_level_notes
    }
}

function AuditPromotionUpperLevelCredits(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_upper_level_credits = rule?.value ?? 0;

    const level_min = rule?.course_level_min ?? 0;
    const level_max = rule?.course_level_max ?? 0;

    const total_upper_level_credits = student_course_plan
        .filter((course) => {
            course.course_number >= level_min &&
            course.course_number <= level_max
        })
        .reduce((accm, cur) => accm + cur.credits, 0);

    const upper_level_credits_notes = rule.notes;

    return {
        required_upper_level_credits, 
        total_upper_level_credits, 
        upper_level_credits_notes
    }
}

function AuditPromotionOneLabCourse(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_lab_courses = rule?.value ?? 0;

    const total_lab_courses = student_course_plan
        .filter((course) => course.is_lab_course)
        .length

    const lab_courses_notes = rule.notes;

    return {
        required_lab_courses, 
        total_lab_courses, 
        lab_courses_notes
    }
}

function AuditPromotionMinCommunicationCredits(
    rule: PromotionRules,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total science promotion rules credits at level.
    const required_min_communication_credits = rule?.value ?? 0;

    const total_communication_credits = student_course_plan
        .filter((course) => course.is_communication_course)
        .reduce((accm, cur) => accm + cur.credits, 0);

    const communication_credits_notes = rule.notes;

    return {
        required_min_communication_credits, 
        total_communication_credits, 
        communication_credits_notes
    }
}