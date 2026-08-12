import type { 
    CourseRules, 
    FacultyRequirements, 
    PromotionRules,
    CourseRequirements,
    SpecializationRequirementGroup,
    SpecializationRequirementCourse,
    AllocationConfigs
} from '../types/auditRules'
import auditRules from '../data/rules.json'

export function LoadRules() {
    const facultyRequirements = auditRules.facultyRequirements as FacultyRequirements[];
    const courseRules = auditRules.courseRules as CourseRules[];
    const promotionRules = auditRules.promotionRules as PromotionRules[];
    const courseRequirements = auditRules.courseRequirements as CourseRequirements[];
    const specializationRequirementGroups = auditRules.specializationRequirementGroups as SpecializationRequirementGroup[];
    const specializationRequirementCourses = auditRules.specializationRequirementCourses as SpecializationRequirementCourse[];
    const allocationConfigs = auditRules.allocationConfigs as AllocationConfigs;

    return {
        facultyRequirements, 
        courseRules, 
        promotionRules,
        courseRequirements,
        specializationRequirementGroups,
        specializationRequirementCourses,
        allocationConfigs
    };
}