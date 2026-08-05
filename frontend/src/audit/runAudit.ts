import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type { 
    AuditCaseSummary, 
    AuditResult,
    AuditRequirementCountSummary 
} from '../types/audit'

import { FacultyAuditor } from './facultyAuditor'
import { LoadRules } from './loadRules'
import { PromotionAuditor } from './promotionAudit'

interface RunAuditProps {
    classified_courses: CatalogueCourse[]
    student_course_plan: CourseAttempt[]
    student_profile: StudentSetupProfile
}

export function RunAudit({
    classified_courses,
    student_course_plan, 
    student_profile
} : RunAuditProps) {
    const {
        facultyRequirements, 
        // courseRules, 
        promotionRules,
        courseRequirements
    } = LoadRules();

    // Faculty Audit
    const faculty_requirements = (
        FacultyAuditor({
            classified_courses: classified_courses,
            faculty_requirements: facultyRequirements, 
            course_requirements: courseRequirements,
            student_course_plan: student_course_plan,
            student_profile: student_profile
        })
    );

    // Promotion Audit
    const promotion_requirements = (
        PromotionAuditor({
            classified_courses: classified_courses,
            promotionRules: promotionRules,
            student_course_plan: student_course_plan,
            student_profile: student_profile
        })
    );

    console.log(promotion_requirements);

    const dummy_req_count_summary: AuditRequirementCountSummary = {
        satisfied: 0,
        total: 0,
        partial: 0,
        missing: 0
    }

    const dummy_case_summary: AuditCaseSummary = {
        case_id: '',
        calendar_year: student_profile.calendar_year,
        program: student_profile.program,
        program_type: student_profile.program_type,
        option_id: student_profile.option_id,
        academic_year: student_profile.academic_year,
        audit_mode: 'planned',
        counted_statuses: [],
        counted_credits: 0,
        faculty: dummy_req_count_summary,
        specialization: dummy_req_count_summary,
        promotion: {
            message: ''
        },
        free_elective_credits: 0,
        remaining_other_faculty_capacity: 0
    }

    const audit_results: AuditResult = {
        schema_version: 1,
        case_summary: dummy_case_summary,
        faculty_requirements: faculty_requirements,
        specialization_requirements: [],
        promotion_requirements: promotion_requirements,
        course_allocations: []
    };

    return audit_results;
}
