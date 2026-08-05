import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type { 
    // CourseRules, 
    FacultyRequirements, 
    // PromotionRules,
    CourseRequirements
} from '../types/auditRules'
import type { 
    FacultyRequirementResult, 
    AuditProgressUnit, 
    AuditRequirementStatus 
} from '../types/audit'

interface FacultyAuditorProps {
    classified_courses: CatalogueCourse[]
    faculty_requirements: FacultyRequirements[]
    course_requirements: CourseRequirements[]
    student_course_plan: CourseAttempt[]
    student_profile: StudentSetupProfile
}

interface RecordFacultyRequirementProps {
    requirement_id: string
    requirement_area: string
    label: string
    completed: number
    required: number
    unit: AuditProgressUnit
    matched_courses: string[]
    notes?: string
}

export function FacultyAuditor({
    faculty_requirements, 
    course_requirements,
    student_course_plan,
    student_profile
} : FacultyAuditorProps) {
    const facult_requirement_results : FacultyRequirementResult[] = []

    const facultyRequirementLookup = Object.fromEntries(
        faculty_requirements.map(req => [
            req.metric,
            req,
        ])
    );

    // Total Faculty Credits
    const {required_credits, total_credits, total_notes} = AuditTotalCredits(
        facultyRequirementLookup, 
        course_requirements,
        student_profile,
        student_course_plan
    );
    // TEMPORARY - NEED TO FIGURE OUT PURPOSE
    const matched_courses: string[] = [];

    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "TOTAL_CREDITS",
            requirement_area: "Faculty Requirement",
            label: "Faculty Total Credits",
            completed: total_credits,
            required: required_credits,
            unit: "credits",
            matched_courses: matched_courses,
            notes: total_notes
        })
    )

    // Total Science Credits
    const {science_required, total_science_credits, sci_notes} = AuditScienceCredits(
        facultyRequirementLookup,
        student_course_plan
    )

    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "SCIENCE_CREDITS",
            requirement_area: "Faculty Requirement",
            label: "Faculty Science Credits",
            completed: total_science_credits,
            required: science_required,
            unit: "credits",
            matched_courses: matched_courses,
            notes: sci_notes
        })
    )

    // Total Arts Credits
    const {arts_required, total_arts_credits, arts_notes} = AuditArtsCredits(
        facultyRequirementLookup,
        student_course_plan
    )

    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "ARTS_CREDITS",
            requirement_area: "Faculty Requirement",
            label: "Faculty Arts Credits",
            completed: total_arts_credits,
            required: arts_required,
            unit: "credits",
            matched_courses: matched_courses,
            notes: arts_notes
        })
    )

    // Upper-level Credits
    const {upper_level_required, upper_level_credits, upper_level_notes} = AuditUpperLevelTotal(
        facultyRequirementLookup,
        student_course_plan
    )

    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "UPPER_LEVEL_TOTAL",
            requirement_area: "Faculty Requirement",
            label: "Faculty Upper-Level Credits",
            completed: upper_level_credits,
            required: upper_level_required,
            unit: "credits",
            matched_courses: matched_courses,
            notes: upper_level_notes
        })
    )
    
    // Upper-level Science Credits
    const {
        upper_level_science_required,
        upper_level_science_credits, 
        upper_level_science_notes
    } = AuditUpperLevelScience(
        facultyRequirementLookup,
        student_course_plan,
        student_profile
    )

    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "UPPER_LEVEL_SCIENCE",
            requirement_area: "Faculty Requirement",
            label: "Faculty Upper-Level Science Credits",
            completed: upper_level_science_credits,
            required: upper_level_science_required,
            unit: "credits",
            matched_courses: matched_courses,
            notes: upper_level_science_notes
        })
    )

    // Breadth Requirements

    // Lab Requirements

    // Communication Requirements

    return facult_requirement_results;
}

function createFacultyRequirementResult({
    requirement_id,
    requirement_area,
    label,
    completed,
    required,
    unit,
    matched_courses,
    notes
} : RecordFacultyRequirementProps) {
    const getRequirementStatus = (required: number, completed: number): AuditRequirementStatus => {
        if (completed >= required) return "satisfied"
        if (completed > 0) return "partial"
        return "missing"
    }

    const surplus = Math.max(completed-required, 0);
    const remaining = Math.max(required-completed, 0);

    const total_credits_result: FacultyRequirementResult = {
        requirement_id: requirement_id,
        requirement_area: requirement_area,
        label: label,
        status: getRequirementStatus(required, completed),
        completed: completed,
        required: required,
        remaining: remaining,
        surplus: surplus,
        unit: unit,
        matched_courses: matched_courses,
        notes: notes
    }

    return total_credits_result
}

function AuditTotalCredits(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    courseRequirements: CourseRequirements[],
    student_profile: StudentSetupProfile,
    student_course_plan: CourseAttempt[]
) {
    // Resolve total degree credits.
    const faculty_minimum = facultyRequirementLookup.min_total_credits?.value ?? 0;
    // Match calendar year, program context, program and metric
    const specialization_minimum = courseRequirements.find(
        req =>
            req.metric === 'min_total_credits' &&
            req.program === student_profile.program &&
            req.calendar_year === student_profile.calendar_year &&
            req.program_context === student_profile.program_type
    );

    const required_credits = Math.max(
        faculty_minimum,
        specialization_minimum?.value ?? 0
    );

    const total_credits = student_course_plan.reduce(
        (accm, cur) => accm + cur.credits, 0
    );

    const total_notes = 
        `Faculty minimum=${faculty_minimum}; ` +
        `specialization minimum=${specialization_minimum}; ` +
        `using required total=${required_credits}.`

    return {required_credits, total_credits, total_notes}
}

function AuditScienceCredits(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve science credits.
    const science_required = facultyRequirementLookup.min_science_credits?.value ?? 0;

    const total_science_credits = student_course_plan
        .filter((course) => course.is_science_credit)
        .reduce((accm, cur) => accm + cur.credits, 0)

    const sci_notes = `Science credits based on faculty course classification rules.`

    return {science_required, total_science_credits, sci_notes}
}

function AuditArtsCredits(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve arts credits.
    const arts_required = facultyRequirementLookup.min_arts_credits?.value ?? 0;

    const total_arts_credits = student_course_plan
        .filter((course) => course.is_arts_credit)
        .reduce((accm, cur) => accm + cur.credits, 0)

    const arts_notes = `Arts credits based on faculty course classification rules.`

    return {arts_required, total_arts_credits, arts_notes}
}

function AuditUpperLevelTotal(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve upper-level credits.
    const upper_level_required = facultyRequirementLookup.min_upper_level_credits?.value ?? 0;

    const upper_level_credits = student_course_plan
        .filter((course) => course.is_upper_level)
        .reduce((accm, cur) => accm + cur.credits, 0)

    const upper_level_notes = `Upper-level means 300-level or above.`

    return {upper_level_required, upper_level_credits, upper_level_notes}
}

function AuditUpperLevelScience(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[],
    student_profile: StudentSetupProfile
) {
    // Resolve upper-level credits.
    const upper_level_science_required = facultyRequirementLookup.min_upper_level_science_credits?.value ?? 0;

    const upper_level_science_credits = student_course_plan
        .filter((course) => course.is_upper_level && course.is_science_credit)
        .reduce((accm, cur) => accm + cur.credits, 0)

    const upper_level_science_notes = 
        `Upper-level Science requirement depends on program type;` +
        `current program type is ${student_profile.program_type}.`

    return {upper_level_science_required, upper_level_science_credits, upper_level_science_notes}
}
