import type { CatalogueCourse } from '../types/courseCatalogue'
import type {
  CourseAttempt,
  PlannerTerm,
  PlannerYear,
  StoredCourseGrade,
  StoredCourseStatus,
} from '../types/coursePlan'
import { emptyStudentSetupProfile, type StudentSetupProfile } from '../types/studentProfile'
import { isCatalogueCourse } from './courseCatalogueLoader'
import {
  academicYears,
  calendarYears,
  concentrationsByCalendarYear,
  programTypes,
  programs,
} from './setupOptions'

// Everything the student has entered, kept in this browser's localStorage so
// it survives reloads and moving between screens. Bump SCHEMA_VERSION when the
// shape changes; older saves are then ignored rather than misread.
const STORAGE_KEY = 'ensc-degree-audit:session'
const SCHEMA_VERSION = 1

export type SavedScreen = 'setup' | 'planner' | 'audit'

export interface SavedSession {
  screen: SavedScreen
  // Setup form as currently filled in, including before it is submitted.
  setup_draft: StudentSetupProfile
  // Profile last submitted from Setup; null until then.
  profile: StudentSetupProfile | null
  // Recommended plan the saved attempts started from (see getRecommendedPlanKey).
  plan_key: string | null
  attempts: CourseAttempt[]
  include_planned_courses: boolean
}

const SCREENS: SavedScreen[] = ['setup', 'planner', 'audit']
const PLANNER_YEARS: PlannerYear[] = [1, 2, 3, 4, 5]
const PLANNER_TERMS: PlannerTerm[] = ['winter_1', 'winter_2', 'summer']
const STATUSES: StoredCourseStatus[] = ['completed', 'in_progress', 'planned']
const GRADES: StoredCourseGrade[] = ['P', 'F', 'W', '']

function isOneOf<T>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value)
}

// Keeps only values the Setup screen still offers, so a save made against an
// older calendar can't put the form into an impossible state.
function sanitizeProfile(value: unknown): StudentSetupProfile {
  if (!value || typeof value !== 'object') return emptyStudentSetupProfile
  const { calendar_year, program, program_type, option_id, academic_year } = value as Record<
    string,
    unknown
  >

  const validCalendarYear = isOneOf(calendarYears, calendar_year) ? calendar_year : ''
  const validOptionIds = validCalendarYear
    ? concentrationsByCalendarYear[validCalendarYear].map((concentration) => concentration.optionId)
    : []
  const validProgramCodes = programs.map((entry) => entry.code)
  const validAcademicYears = academicYears.map((year) => year.value)

  return {
    calendar_year: validCalendarYear,
    program: isOneOf(validProgramCodes, program) ? program : '',
    program_type: isOneOf(programTypes, program_type) ? program_type : '',
    option_id: isOneOf(validOptionIds, option_id) ? option_id : '',
    academic_year: isOneOf(validAcademicYears, academic_year) ? academic_year : '',
  }
}

function isProfileComplete(profile: StudentSetupProfile) {
  return Object.values(profile).every(Boolean)
}

function isSavedAttempt(value: unknown): value is CourseAttempt {
  if (!isCatalogueCourse(value)) return false
  const attempt = value as Record<string, unknown>
  return (
    typeof attempt.attempt_id === 'string' &&
    typeof attempt.credits === 'number' &&
    isOneOf(STATUSES, attempt.status) &&
    isOneOf(GRADES, attempt.grade) &&
    isOneOf(PLANNER_YEARS, attempt.year_taken) &&
    isOneOf(PLANNER_TERMS, attempt.term_taken)
  )
}

export function loadSavedSession(): SavedSession | null {
  let stored: string | null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!stored) return null

  try {
    const data: unknown = JSON.parse(stored)
    if (!data || typeof data !== 'object') return null
    const saved = data as Record<string, unknown>
    if (saved.schema_version !== SCHEMA_VERSION) return null

    // A plan only makes sense alongside a complete, still-valid profile.
    const sanitizedProfile = saved.profile ? sanitizeProfile(saved.profile) : null
    const profile = sanitizedProfile && isProfileComplete(sanitizedProfile) ? sanitizedProfile : null

    return {
      screen: profile && isOneOf(SCREENS, saved.screen) ? saved.screen : 'setup',
      setup_draft: sanitizeProfile(saved.setup_draft),
      profile,
      plan_key: profile && typeof saved.plan_key === 'string' ? saved.plan_key : null,
      attempts: profile && Array.isArray(saved.attempts) ? saved.attempts.filter(isSavedAttempt) : [],
      include_planned_courses:
        typeof saved.include_planned_courses === 'boolean' ? saved.include_planned_courses : true,
    }
  } catch (error) {
    console.warn('[savedSession] Ignoring unreadable saved session', error)
    return null
  }
}

export function saveSession(session: SavedSession) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schema_version: SCHEMA_VERSION, ...session }),
    )
  } catch (error) {
    console.warn('[savedSession] Could not save inputs in this browser', error)
  }
}

export function clearSavedSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is unavailable, so there is nothing saved to clear.
  }
}

// Saved attempts carry a copy of their catalogue entry. Re-apply the current
// catalogue so data updates (credits, breadth categories, ...) reach saved
// plans; courses no longer in the catalogue keep their saved copy.
export function applyCatalogueToAttempts(
  attempts: CourseAttempt[],
  catalogue: CatalogueCourse[],
): CourseAttempt[] {
  const catalogueByCode = new Map(
    catalogue.map((course) => [course.course_code.trim().toUpperCase(), course]),
  )
  return attempts.map((attempt) => {
    const catalogueCourse = catalogueByCode.get(attempt.course_code.trim().toUpperCase())
    if (!catalogueCourse) return attempt
    const { attempt_id, status, grade, percentage, year_taken, term_taken, source } = attempt
    return {
      ...attempt,
      ...catalogueCourse,
      attempt_id,
      status,
      grade,
      percentage,
      year_taken,
      term_taken,
      source,
    }
  })
}
