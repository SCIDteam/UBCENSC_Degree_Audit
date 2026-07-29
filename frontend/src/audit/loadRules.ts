import type { 
    CourseRules, 
    FacultyRequirements, 
    PromotionRules,
    CourseRequirements
} from '../types/auditRules'
import auditRules from '../../public/data/rules.json'

export function LoadRules() {
    const facultyRequirements = auditRules.facultyRequirements as FacultyRequirements[];
    const courseRules = auditRules.courseRules as CourseRules[];
    const promotionRules = auditRules.promotionRules as PromotionRules[];
    const courseRequirements = auditRules.courseRequirements as CourseRequirements[];

    return {
        facultyRequirements, 
        courseRules, 
        promotionRules,
        courseRequirements
    };
}