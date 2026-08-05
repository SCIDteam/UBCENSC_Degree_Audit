import type { CatalogueCourse } from "./courseCatalogue"

export type PlannerYear = 1 | 2 | 3 | 4 | 5

export type PlannerTerm = 'winter_1' | 'winter_2' | 'summer'

export type StoredCourseStatus = 'completed' | 'in_progress' | 'planned'

export type StoredCourseGrade = 'P' | 'F' | 'W' | ''

export type CourseAttempt = CatalogueCourse & {
  // Attempt info
  attempt_id: string
  status: StoredCourseStatus
  grade: StoredCourseGrade
  percentage: number | null
  year_taken: PlannerYear
  term_taken: PlannerTerm
  source: 'manual' | 'synthetic'
}

export type CourseAddedToast = {
  id: string
  courseCode: string
  year: PlannerYear
  term: PlannerTerm
}
