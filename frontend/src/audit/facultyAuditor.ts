import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type {
    FacultyRequirements,
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
}: FacultyAuditorProps) {
    const facult_requirement_results: FacultyRequirementResult[] = []

    const facultyRequirementLookup = Object.fromEntries(
        faculty_requirements.map(req => [
            req.metric,
            req,
        ])
    );

    // Total Faculty Credits
    const {
        required_credits,
        total_credits,
        total_notes,
        matched_courses: total_credits_matched_courses
    } = AuditTotalCredits(
        facultyRequirementLookup,
        course_requirements,
        student_profile,
        student_course_plan
    );

    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "TOTAL_CREDITS",
            requirement_area: "Faculty Requirement",
            label: "Faculty Total Credits",
            completed: total_credits,
            required: required_credits,
            unit: "credits",
            matched_courses: total_credits_matched_courses,
            notes: total_notes
        })
    )

    // Total Science Credits
    const {
        science_required,
        total_science_credits,
        sci_notes,
        matched_courses: science_credits_matched_courses
    } = AuditScienceCredits(
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
            matched_courses: science_credits_matched_courses,
            notes: sci_notes
        })
    )

    // Total Arts Credits
    const {
        arts_required,
        total_arts_credits,
        arts_notes,
        matched_courses: arts_credits_matched_courses
    } = AuditArtsCredits(
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
            matched_courses: arts_credits_matched_courses,
            notes: arts_notes
        })
    )

    // Upper-level Credits
    const {
        upper_level_required,
        upper_level_credits,
        upper_level_notes,
        matched_courses: upper_level_total_matched_courses
    } = AuditUpperLevelTotal(
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
            matched_courses: upper_level_total_matched_courses,
            notes: upper_level_notes
        })
    )

    // Upper-level Science Credits
    const {
        upper_level_science_required,
        upper_level_science_credits,
        upper_level_science_notes,
        matched_courses: upper_level_science_matched_courses
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
            matched_courses: upper_level_science_matched_courses,
            notes: upper_level_science_notes
        })
    )

    // Breadth Requirements
    const {
        min_breadth_categories,
        completed,
        min_breadth_categories_notes,
        matched_courses: breadth_matched_courses
    } = AuditScienceBreadth(
        facultyRequirementLookup,
        student_course_plan
    )
    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "SCIENCE_BREADTH",
            requirement_area: "Faculty Requirement",
            label: "Faculty Breadth Categories",
            completed: completed,
            required: min_breadth_categories,
            unit: "categories",
            matched_courses: breadth_matched_courses,
            notes: min_breadth_categories_notes
        })
    )

    // Lab Requirements
    const {
        min_lab_courses_required,
        num_lab_courses,
        lab_requirement_notes,
        matched_courses: lab_matched_courses
    } = AuditLabRequirement(
        facultyRequirementLookup,
        student_course_plan
    )
    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "LAB_REQUIREMENT",
            requirement_area: "Faculty Requirement",
            label: "Lab Science Credits",
            completed: num_lab_courses,
            required: min_lab_courses_required,
            unit: "course",
            matched_courses: lab_matched_courses,
            notes: lab_requirement_notes
        })
    )

    // Communication Requirements
    const {
        min_communication_credits,
        communication_credits,
        communication_notes,
        matched_courses: communication_matched_courses
    } = AuditCommunicationRequirement(
        facultyRequirementLookup,
        student_course_plan
    )
    facult_requirement_results.push(
        createFacultyRequirementResult({
            requirement_id: "COMMUNICATION",
            requirement_area: "Faculty Requirement",
            label: "Faculty Communication Credits",
            completed: communication_credits,
            required: min_communication_credits,
            unit: "credits",
            matched_courses: communication_matched_courses,
            notes: communication_notes
        })
    )

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
}: RecordFacultyRequirementProps) {
    const getRequirementStatus = (required: number, completed: number): AuditRequirementStatus => {
        if (completed >= required) return "satisfied"
        if (completed > 0) return "partial"
        return "missing"
    }

    const surplus = Math.max(completed - required, 0);
    const remaining = Math.max(required - completed, 0);

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
            (
                req.applicable_program === student_profile.program_type ||
                req.applicable_program === 'All'
            )

    );

    const required_credits = Math.max(
        faculty_minimum,
        specialization_minimum?.value ?? 0
    );

    // All counted courses contribute to total credits.
    const matchedCourses = student_course_plan;

    const total_credits = matchedCourses.reduce(
        (accm, cur) => accm + cur.credits, 0
    );

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const total_notes =
        `Faculty minimum=${faculty_minimum}; ` +
        `specialization minimum=${specialization_minimum}; ` +
        `using required total=${required_credits}.`

    return { required_credits, total_credits, total_notes, matched_courses }
}

function AuditScienceCredits(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve science credits.
    const science_required = facultyRequirementLookup.min_science_credits?.value ?? 0;

    const matchedCourses = student_course_plan.filter((course) => course.is_science_credit)

    const total_science_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0)

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const sci_notes = `Science credits based on faculty course classification rules.`

    return { science_required, total_science_credits, sci_notes, matched_courses }
}

function AuditArtsCredits(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve arts credits.
    const arts_required = facultyRequirementLookup.min_arts_credits?.value ?? 0;

    const matchedCourses = student_course_plan.filter((course) => course.is_arts_credit)

    const total_arts_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0)

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const arts_notes = `Arts credits based on faculty course classification rules.`

    return { arts_required, total_arts_credits, arts_notes, matched_courses }
}

function AuditUpperLevelTotal(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve upper-level credits.
    const upper_level_required = facultyRequirementLookup.min_upper_level_credits?.value ?? 0;

    const matchedCourses = student_course_plan.filter((course) => course.is_upper_level)

    const upper_level_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0)

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const upper_level_notes = `Upper-level means 300-level or above.`

    return { upper_level_required, upper_level_credits, upper_level_notes, matched_courses }
}

function AuditUpperLevelScience(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[],
    student_profile: StudentSetupProfile
) {
    // Resolve upper-level credits.
    const upper_level_science_required = facultyRequirementLookup.min_upper_level_science_credits?.value ?? 0;

    const matchedCourses = student_course_plan
        .filter((course) => course.is_upper_level && course.is_science_credit)

    const upper_level_science_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0)

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const upper_level_science_notes =
        `Upper-level Science requirement depends on program type;` +
        `current program type is ${student_profile.program_type}.`

    return { upper_level_science_required, upper_level_science_credits, upper_level_science_notes, matched_courses }
}

function AuditScienceBreadth(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve minimum science-breadth categories.
    const min_breadth_categories = facultyRequirementLookup.min_breadth_categories?.value ?? 0;

    const category_credit_totals = student_course_plan.reduce((accm, cur) => {
        cur.breadth_categories.forEach((category) => {
            if (!accm[category]) {
                accm[category] = 0;
            }
            accm[category] += cur.credits;
        })
        return accm;
    }, {} as Record<string, number>);

    const completed_categories = Object.entries(category_credit_totals)
        .filter(([_, credits]) => credits >= 3)
        .map(([category, _]) => category);

    const sorted_completed_categories = [...completed_categories].sort((a, b) => a.localeCompare(b));

    const completedCategorySet = new Set(completed_categories);

    const matchedCourses = student_course_plan.filter((course) =>
        course.breadth_categories.some((category) =>
            completedCategorySet.has(category)
        )
    )

    const matched_courses = uniqueCourseCodes(matchedCourses)

    const min_breadth_categories_notes =
        `Completed categories with at least 3 credits: ` +
        `${sorted_completed_categories.join(', ')}`
    const completed = completed_categories.length;

    // Tim's Python implementation does not attribute breadth completion to
    // individual courses; matched_courses is always empty for this requirement.
    // const matched_courses: string[] = [];

    return { min_breadth_categories, completed, min_breadth_categories_notes, matched_courses }
}

function AuditLabRequirement(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve lab requirement courses.
    const min_lab_courses_required = facultyRequirementLookup.one_course_from_list?.value ?? 0;

    const matchedCourses = student_course_plan.filter((course) => course.is_lab_course)

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const num_lab_courses = matched_courses.length

    const lab_requirement_notes =
        `Satisfied if at least one laboratory science course is counted.`

    return { min_lab_courses_required, num_lab_courses, lab_requirement_notes, matched_courses }
}

function AuditCommunicationRequirement(
    facultyRequirementLookup: Record<string, FacultyRequirements>,
    student_course_plan: CourseAttempt[]
) {
    // Resolve upper-level credits.
    const min_communication_credits = facultyRequirementLookup.min_communication_credits?.value ?? 0;

    const matchedCourses = student_course_plan.filter((course) => course.is_communication_course)

    const communication_credits = matchedCourses
        .reduce((accm, cur) => accm + cur.credits, 0)

    const matched_courses = uniqueCourseCodes(matchedCourses);

    const communication_notes =
        `Communication requirement satisfied by mapped communication courses.`

    return { min_communication_credits, communication_credits, communication_notes, matched_courses }
}