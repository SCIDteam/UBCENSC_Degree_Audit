export type PlannerYear = 1 | 2 | 3 | 4 | 5

export type PlannerTerm = 'winter_1' | 'winter_2' | 'summer'

export type StoredCourseStatus = 'completed' | 'in_progress' | 'planned'

export type StoredCourseGrade = 'P' | 'F' | 'W' | ''

export type CourseAttempt = {
  attempt_id: string
  course_code: string
  display_code: string
  subject: string
  course_number: string
  course_level: number
  course_title: string
  credits: number
  status: StoredCourseStatus
  grade: StoredCourseGrade
  percentage: number | null
  year_taken: PlannerYear
  term_taken: PlannerTerm
  source: 'manual'
}
