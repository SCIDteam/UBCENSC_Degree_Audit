import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type { 
    AuditCaseSummary, 
    AuditResult,
    AuditRequirementCountSummary ,
    FacultyRequirementResult,
    PromotionRequirementResult
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

    const faculty_count_summary = createAuditRequirementCountSummary(faculty_requirements);

    // Promotion Audit
    const promotion_target_year = getPromotionTargetYear(Number(student_profile.academic_year))
    const promotion_requirements = (
        PromotionAuditor({
            promotion_target_year: promotion_target_year,
            classified_courses: classified_courses,
            promotionRules: promotionRules,
            student_course_plan: student_course_plan,
            student_profile: student_profile
        })
    );

    const promotion_message = getPromotionMessage(
        promotion_target_year, 
        student_profile, 
        promotion_requirements
    );
    console.log(promotion_requirements);
    console.log(promotion_message);

    // Create case summary
    const case_id = crypto.randomUUID();
    const counted_credits = student_course_plan
        .reduce((accm, cur) => accm + cur.credits, 0)
    const dummy_req_count_summary: AuditRequirementCountSummary = {
        satisfied: 0,
        total: 0,
        partial: 0,
        missing: 0
    }

    const case_summary: AuditCaseSummary = {
        case_id: case_id,

        calendar_year: student_profile.calendar_year,
        program: student_profile.program,
        program_type: student_profile.program_type,
        option_id: student_profile.option_id,
        academic_year: student_profile.academic_year,

        audit_mode: 'planned',
        counted_statuses: ['completed'],

        counted_credits: counted_credits,
        faculty: faculty_count_summary,
        specialization: dummy_req_count_summary,
        promotion: {
            message: promotion_message
        },
        free_elective_credits: 0,
        remaining_other_faculty_capacity: 0
    }

    // Create audit result instance
    const audit_results: AuditResult = {
        schema_version: 1,
        case_summary: case_summary,
        faculty_requirements: faculty_requirements,
        specialization_requirements: [],
        promotion_requirements: promotion_requirements,
        course_allocations: []
    };

    return audit_results;
}

function createAuditRequirementCountSummary(requirements: FacultyRequirementResult[]) {
    const grouped_by_status = requirements.reduce<Record<string, number>>((accm, req) => {
        if (!accm[req.status]) {
            accm[req.status] = 0;
        }
        accm[req.status] += 1;
        return accm;
        }, {}
    );
    const satisfied = grouped_by_status.satisfied ?? 0;
    const partial = grouped_by_status.partial ?? 0;
    const missing = grouped_by_status.missing ?? 0;;

    const count_summary: AuditRequirementCountSummary = {
        satisfied: satisfied,
        total: satisfied+partial+missing,
        partial: partial,
        missing: missing,
    }
    return count_summary;
}

function getPromotionTargetYear(academic_year : number) {
    if (academic_year === null || academic_year === 4) {
        return null;
    }
    return academic_year+1
}

function getPromotionMessage(
    promotion_target_year: number | null,
    student_profile: StudentSetupProfile,
    promotion_requirements: PromotionRequirementResult[]
) {
    // Null target promotion year - student is in final year or value missing
    if (promotion_target_year === null) {
        if (student_profile.academic_year === 4) {
            return `Student in final year. Check graduation requirements.`;
        }
        else {
            return `Promotion target is unknown because academic_year is missing.`;
        }
    }

    // Total credits for each status
    const grouped_by_status = promotion_requirements.reduce<Record<string, number>>((accm, req) => {
        if (!accm[req.status]) {
            accm[req.status] = 0;
        }
        accm[req.status] += 1;
        return accm;
        }, {}
    );
    console.log(grouped_by_status);
    if (grouped_by_status.missing === 0) {
        return `All requirements satisfied.`;
    }

    const total = Object.values(grouped_by_status).reduce((accm, credits) => accm + credits, 0);
    return `${grouped_by_status.satisfied}/${total} requirements satisfied.`;
    // More info to be included later
}
