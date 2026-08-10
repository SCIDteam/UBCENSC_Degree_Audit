// import type { CatalogueCourse } from '../types/courseCatalogue'
// import type { CourseAttempt } from '../types/coursePlan'
// import type { StudentSetupProfile } from '../types/studentProfile'
// import type {
//     CourseRequirements
// } from '../types/auditRules'
// import type { 
//     SpecializationRequirementResult, 
//     AuditProgressUnit, 
//     AuditRequirementStatus 
// } from '../types/audit'
// import type {
//   AcademicYearValue,
//   CalendarYear,
//   OptionId,
//   ProgramCode,
//   ProgramType,
// } from '../data/setupOptions'

// interface SpecializationAuditorProps {
//     courseRequirements: CourseRequirements[]
//     student_course_plan: CourseAttempt[]
//     student_profile: StudentSetupProfile
// }

// interface RecordSpecializationProps {
//     group_id: string
//     requirement_area: string
//     option_id: OptionId | ''
//     option_name: string | null
//     theme?: string
//     label: string
//     rule_type: string
//     completed: number
//     required: number
//     unit: AuditProgressUnit
//     allocated_courses: string[]
//     allocation_notes?: string
// }

// export function SpecializationAuditor({
//     courseRequirements,
//     student_course_plan,
//     student_profile
// } : SpecializationAuditorProps) {
//     const specialization_requirements_results = [];

//     const studentRequirementGroups = getApplicableRequirementGroups(
//         courseRequirements, 
//         student_profile
//     )

//     const courseRequirementLookup = studentRequirementGroups
//         .reduce<Record<string, Record<string, CourseRequirements[]>>>(
//             (acc, req) => {
//                 acc[req.option_id] ??= {};
//                 acc[req.option_id][req.metric] ??= [];
//                 acc[req.option_id][req.metric].push(req);
//                 return acc;
//             }, 
//             {}
//         );

//     const {
//         group_id, 
//         required, 
//         completed, 
//         option_name
//     } = auditCanonicalAOCMinimum(
//         courseRequirementLookup,
//         student_course_plan,
//         student_profile
//     );

//     specialization_requirements_results.push(
//         createSpecializationRequirementResult({
//             group_id: group_id,
//             requirement_area: "Area of Concentration",
//             option_id: student_profile.option_id,
//             option_name: option_name,
//             label: "Area of Concentration total credits",
//             rule_type: "option_total_credits",
//             completed: completed,
//             required: required,
//             unit: "credits",
//             allocated_courses: [],
//             allocation_notes: ''
//         })
//     )
// }

// function createSpecializationRequirementResult({
//     group_id,
//     requirement_area,
//     option_id,
//     option_name,
//     theme,
//     label,
//     rule_type,
//     completed,
//     required,
//     unit,
//     allocated_courses,
//     allocation_notes
// } : RecordSpecializationProps) {
//     const getRequirementStatus = (required: number, completed: number): AuditRequirementStatus => {
//         if (completed >= required) return "satisfied"
//         if (completed > 0) return "partial"
//         return "missing"
//     }

//     const surplus = Math.max(completed-required, 0);
//     const remaining = Math.max(required-completed, 0);

//     const total_credits_result: SpecializationRequirementResult = {
//         group_id: group_id,
//         requirement_area: requirement_area,
//         option_id: option_id,
//         option_name: option_name,
//         theme: theme,
//         label: label,
//         rule_type: rule_type,
//         status: getRequirementStatus(required, completed),
//         completed: completed,
//         required: required,
//         remaining: remaining,
//         surplus: surplus,
//         unit: unit,
//         allocated_courses: allocated_courses,
//         allocation_notes: allocation_notes
//     }

//     return total_credits_result
// }

// function getSelectedOptionName(
//     courseRequirementLookup: Record<string, Record<string, CourseRequirements[]>>,
//     option_id: string
// ) {
//     if (option_id.length === 0){
//         return '';
//     }
//     return Object.values(courseRequirementLookup[option_id] ?? {}).flat()[0].option_name;
// }

// function getApplicableRequirementGroups(
//     courseRequirements: CourseRequirements[],
//     student_profile: StudentSetupProfile
// ) {
//     return courseRequirements
//         .filter(
//             req => (
//                 (req.program === student_profile.program || req.program === 'ALL' || req.program === '') &&
//                 // Not considering MajorOrHonours etc.
//                 (req.program_context === student_profile.program_type || req.program_context === 'ALL' || req.program_context === '') &&
//                 (req.calendar_year === student_profile.calendar_year || req.calendar_year === 'ALL' || req.calendar_year === '') &&

//                 req.calendar_year === student_profile.calendar_year &&
//                 req.option_id === student_profile.option_id
//                 // is_recommended not included
//             )
//         )
// }

// function getOptionEligibleCourseCodes() {

// }

// function auditCanonicalAOCMinimum(
//     courseRequirementLookup: Record<string, Record<string, CourseRequirements[]>>,
//     student_course_plan: CourseAttempt[],
//     student_profile: StudentSetupProfile
// ) {
//     let metric = 'option_minimum_credits';
//     let matched_requirements = [];
//     let required = 0;
//     let completed = 0;

//     matched_requirements = courseRequirementLookup[metric]?.[student_profile.option_id] ?? [];

//     // Prefer option-specific minimum-credit rows
//     // Fall back to generic option minimums
//     // Seems to only be applicable for 2024-2025 calendar year
//     if (matched_requirements.length !== 0) {
//         required = matched_requirements
//             .reduce((max, cur) => Math.max(max, cur.value), 0)
//     }
//     else {
//         // Fall back to summing table-split AoC credit rows.
//         metric = 'area_of_concentration_credits';
//         matched_requirements = courseRequirementLookup[metric]?.[student_profile.option_id] ?? [];

//         if (matched_requirements.length !== 0) {
//             const aoc_credits = courseRequirementLookup[`${metric}&`] ?? null;
//             if (aoc_credits !== null) {
//                 required = matched_requirements
//                     .reduce((accm, cur) => accm + cur.value, 0)
//             }
//         }
//     }

//     const option_name = getSelectedOptionName(
//         courseRequirementLookup, student_profile.option_id
//     )

//     let group_id = '';
//     if (student_profile.option_id === '') {
//         group_id = `${student_profile.program}` +
//             `${student_profile.calendar_year}` +
//             `${student_profile.program_type}` +
//             `AOC_NO_OPTION_CANONICAL_TOTAL_CREDITS`

//         group_id = group_id.replaceAll(/-| /g, '_')
//         return {group_id, required, completed, option_name}
//     }

//     return {group_id, required, completed, option_name}
// }