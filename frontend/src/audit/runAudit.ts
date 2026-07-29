import type { CatalogueCourse } from '../types/courseCatalogue'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type { AuditResult } from '../types/audit'

import { FacultyAuditor } from './facultyAuditor'
import { LoadRules } from './loadRules'

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
        courseRules, 
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

    console.log(faculty_requirements);

    // const audit_results: AuditResult = {
    //     ...
    //     faculty_requirements=faculty_requirements
    // };
}
