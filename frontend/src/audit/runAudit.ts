import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type {
    AuditCaseSummary,
    AuditResult,
    AuditRequirementCountSummary,
    AuditRequirementStatus,
    PromotionRequirementResult
} from '../types/audit'

import { FacultyAuditor } from './facultyAuditor'
import { LoadRules } from './loadRules'
import { PromotionAuditor } from './promotionAudit'
import { SpecializationAuditor } from './specializationAuditor'
import { SpecializationRequirementResolver } from './specializationRequirementResolver'
import { allocateCourses, toCourseAllocationResults } from './allocationEngine'
import { buildAllocatedSpecializationAudit } from './allocatedSpecializationAuditor'

interface RunAuditProps {
    classified_courses: CatalogueCourse[]
    student_course_plan: CourseAttempt[]
    student_profile: StudentSetupProfile
}

export function RunAudit({
    classified_courses,
    student_course_plan,
    student_profile
}: RunAuditProps) {
    const {
        facultyRequirements,
        // courseRules,
        promotionRules,
        courseRequirements,
        specializationRequirementGroups,
        specializationRequirementCourses,
        allocationConfigs
    } = LoadRules();

    // Filter for counted courses
    const filtered_course_plan = filterCountedCourses(student_course_plan);

    // Faculty Audit
    const faculty_requirements = (
        FacultyAuditor({
            classified_courses: classified_courses,
            faculty_requirements: facultyRequirements,
            course_requirements: courseRequirements,
            student_course_plan: filtered_course_plan,
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
            student_course_plan: filtered_course_plan,
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

    // Specialization resolver (shared across pre-allocation audit, allocation,
    // and post-allocation specialization rebuild)
    const specialization_resolver = new SpecializationRequirementResolver({
        requirementGroups: specializationRequirementGroups,
        requirementCourses: specializationRequirementCourses,
        studentProfile: student_profile
    });

    // Pre-allocation specialization audit (internal only; not part of the
    // public AuditResult contract)
    const specializationAudit = SpecializationAuditor({
        classified_courses: classified_courses,
        specialization_requirement_groups: specializationRequirementGroups,
        specialization_requirement_courses: specializationRequirementCourses,
        student_course_plan: student_course_plan,
        student_profile: student_profile
    });

    // Course allocation, using the FULL student course plan so that failed,
    // withdrawn, planned, and in-progress attempts are all preserved
    const allocation_rows = allocateCourses(
        student_course_plan,
        specializationAudit,
        allocationConfigs,
        specialization_resolver
    );

    const course_allocations = toCourseAllocationResults(allocation_rows);

    // Post-allocation specialization requirements (the public result)
    const specialization_requirements = buildAllocatedSpecializationAudit(
        specializationAudit,
        allocation_rows,
        allocationConfigs,
        specialization_resolver
    );

    const specialization_count_summary = createAuditRequirementCountSummary(specialization_requirements);

    // Create case summary
    const case_id = crypto.randomUUID();
    const counted_credits = filtered_course_plan
        .reduce((accm, cur) => accm + cur.credits, 0)

    // Calculate other faculty credit capacity
    const counted_other_fac = filtered_course_plan
        .filter(course => !course.is_arts_credit && !course.is_science_credit)
        .reduce((total, course) => total + course.credits, 0);
    const other_fac_cap =
        facultyRequirements.find(
            req => req.id === 'OTHER_FACULTY_CREDITS_CAP'
        )?.value ?? 0;
    const remaining_other_faculty_capacity = Math.max(
        0,
        other_fac_cap - counted_other_fac
    );

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
        specialization: specialization_count_summary,
        promotion: {
            message: promotion_message
        },
        free_elective_credits: 0,
        remaining_other_faculty_capacity: remaining_other_faculty_capacity
    }

    // Create audit result instance
    const audit_results: AuditResult = {
        schema_version: 1,
        case_summary: case_summary,
        faculty_requirements: faculty_requirements,
        specialization_requirements: specialization_requirements,
        promotion_requirements: promotion_requirements,
        course_allocations: course_allocations
    };

    return audit_results;
}

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

function createAuditRequirementCountSummary(requirements: { status: AuditRequirementStatus }[]) {
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
        total: satisfied + partial + missing,
        partial: partial,
        missing: missing,
    }
    return count_summary;
}

function getPromotionTargetYear(academic_year: number) {
    if (academic_year === null || academic_year === 4) {
        return null;
    }
    return academic_year + 1
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
