import type {
  AcademicYearValue,
  CalendarYear,
  OptionId,
  ProgramCode,
  ProgramType,
} from '../utils/setupOptions'
import type {
  PlannerTerm,
  PlannerYear,
  StoredCourseGrade,
  StoredCourseStatus,
} from './coursePlan'

// ---------------------------------------------------------------------------
// Audit Input
// ---------------------------------------------------------------------------

export interface AuditProfileInput {
  calendar_year: CalendarYear
  program: ProgramCode
  program_type: ProgramType
  option_id: OptionId
  academic_year: AcademicYearValue
}

export type AuditMode = 'planned'

export interface AuditOptions {
  audit_mode: AuditMode
  counted_statuses: StoredCourseStatus[]
}

// absolute_term will later hold calendar-anchored values such as
// "2024W1", "2025W2", or "2025S", derived from calendar_year,
// year_taken, and term_taken.
export interface AuditCourseInput {
  attempt_id: string
  course_code: string
  status: StoredCourseStatus
  credits: number
  year_taken: PlannerYear
  term_taken: PlannerTerm
  absolute_term: string | null
  grade: StoredCourseGrade
  percentage: number | null
  source: 'manual' | 'synthetic'
  override_course_code: string | null
  override_exclusive_group_id: string | null
  override_exclusive_requirement_area: string | null
  override_allow_double_count: boolean | null
  override_double_count_groups: string[] | null
  override_note: string | null
}

export interface AuditInput {
  schema_version: 1
  profile: AuditProfileInput
  courses: AuditCourseInput[]
  options: AuditOptions
}

// ---------------------------------------------------------------------------
// Audit Result
// ---------------------------------------------------------------------------

// Status of a requirement as evaluated by the audit engine. Distinct from
// StoredCourseStatus, which describes a single course attempt.
export type AuditRequirementStatus = 'satisfied' | 'partial' | 'missing' | 'not_applicable'

export type AuditProgressUnit = 'credits' | 'course' | 'categories'

export interface AuditRequirementCountSummary {
  satisfied: number
  total: number
  partial: number
  missing: number
}

export interface AuditCaseSummary {
  case_id: string
  calendar_year: CalendarYear | ''
  program: ProgramCode | ''
  program_type: ProgramType | ''
  option_id: OptionId | ''
  academic_year: AcademicYearValue | ''
  audit_mode: AuditMode
  counted_statuses: StoredCourseStatus[]
  counted_credits: number
  faculty: AuditRequirementCountSummary
  specialization: AuditRequirementCountSummary
  promotion: {
    message: string
  }
  free_elective_credits: number
  remaining_other_faculty_capacity: number
}

export interface FacultyRequirementResult {
  requirement_id: string
  requirement_area: string
  label: string
  status: AuditRequirementStatus
  completed: number
  required: number
  remaining: number
  surplus: number
  unit: AuditProgressUnit
  matched_courses: string[]
  notes?: string
}

// Represents Tim's final, post-allocation specialization result only.
// Pre-allocation progress is not exposed by this contract.
export interface SpecializationRequirementResult {
  group_id: string
  requirement_area: string
  option_id: OptionId | null
  option_name: string | null
  theme?: string
  label: string
  rule_type: string
  status: AuditRequirementStatus
  completed: number
  required: number
  remaining: number
  surplus: number
  unit: AuditProgressUnit
  allocated_courses: string[]
  allocation_notes?: string
}

export interface PromotionRequirementResult {
  promotion_to: string
  rule_id: string
  requirement_area: string
  label: string
  rule_type: string
  status: AuditRequirementStatus
  completed: number
  required: number
  remaining: number
  surplus: number
  unit: AuditProgressUnit
  matched_courses: string[]
  notes?: string
}

export interface CourseAllocationResult {
  row_id: string
  attempt_id: string
  course_code: string
  year_taken: PlannerYear
  credits: number
  status: StoredCourseStatus
  grade: StoredCourseGrade
  percentage: number | null
  bucket: string
  allocation_method?: string
  allocation_notes?: string
  counted?: boolean
  exclusive_requirement_area?: string
  exclusive_group_id?: string
  exclusive_label?: string
  also_counts_toward?: string[]
  double_count_allowed?: boolean
  double_count_groups?: string[]
}

export interface AuditResult {
  schema_version: 1
  case_summary: AuditCaseSummary
  faculty_requirements: FacultyRequirementResult[]
  specialization_requirements: SpecializationRequirementResult[]
  promotion_requirements: PromotionRequirementResult[]
  course_allocations: CourseAllocationResult[]
}
