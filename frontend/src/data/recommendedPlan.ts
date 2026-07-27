import type { PlannerTermLabel } from '../types/courseCatalogue'
import type { CourseAttempt, PlannerTerm, PlannerYear } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import { loadCourseCatalogue } from './courseCatalogueLoader'

type RecommendedCourseEntry = {
  course_code: string
  year_taken: number
}

type RecommendedProgramEntry = {
  calendar_year: string
  program_type: string
  general_courses?: unknown
  concentrations?: Record<string, unknown>
}

type RecommendedCoursePlansFile = {
  programs: RecommendedProgramEntry[]
}

function isRecommendedCourseEntry(value: unknown): value is RecommendedCourseEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.course_code === 'string' &&
    typeof entry.year_taken === 'number' &&
    Number.isInteger(entry.year_taken) &&
    entry.year_taken >= 1 &&
    entry.year_taken <= 5
  )
}

function normalizeEntries(value: unknown): RecommendedCourseEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecommendedCourseEntry)
}

async function loadRecommendedCoursePlans(): Promise<RecommendedCoursePlansFile> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/recommended-course-plans.json`)
  if (!response.ok) throw new Error('Failed to load recommended course plans')
  const data: unknown = await response.json()
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as { programs?: unknown }).programs)
  ) {
    throw new Error('Recommended course plans file is missing a programs array')
  }
  return data as RecommendedCoursePlansFile
}

function selectRecommendedEntries(
  file: RecommendedCoursePlansFile,
  calendarYear: string,
  programType: string,
  optionId: string,
): RecommendedCourseEntry[] {
  const programEntry = file.programs.find(
    (entry) => entry.calendar_year === calendarYear && entry.program_type === programType,
  )

  if (!programEntry) {
    console.warn(`[recommendedPlan] No recommended plan for ${calendarYear} / ${programType}`)
    return []
  }

  const general = normalizeEntries(programEntry.general_courses)

  const concentrationEntries = programEntry.concentrations?.[optionId]
  if (concentrationEntries === undefined) {
    console.warn(
      `[recommendedPlan] No concentration recommendations for "${optionId}" in ${calendarYear} / ${programType}`,
    )
  }
  const concentration = normalizeEntries(concentrationEntries)

  return [...general, ...concentration]
}

function mapFirstTermOffered(terms: PlannerTermLabel[] | undefined): PlannerTerm {
  const first = terms?.[0]
  if (first === 'Winter Term 2') return 'winter_2'
  if (first === 'Summer') return 'summer'
  return 'winter_1'
}

export async function buildRecommendedAttempts(
  profile: StudentSetupProfile,
): Promise<CourseAttempt[]> {
  const { calendar_year, program_type, option_id, academic_year } = profile
  if (!calendar_year || !program_type || !option_id || typeof academic_year !== 'number') {
    return []
  }

  const [planFile, catalogue] = await Promise.all([
    loadRecommendedCoursePlans(),
    loadCourseCatalogue(),
  ])

  const catalogueByCode = new Map(
    catalogue.map((course) => [course.course_code.trim().toUpperCase(), course]),
  )

  const entries = selectRecommendedEntries(planFile, calendar_year, program_type, option_id)

  const attempts: CourseAttempt[] = []
  for (const entry of entries) {
    const catalogueCourse = catalogueByCode.get(entry.course_code.trim().toUpperCase())
    if (!catalogueCourse) {
      console.warn(
        `[recommendedPlan] Recommended course "${entry.course_code}" was not found in the course catalogue`,
      )
      continue
    }

    const isCompleted = entry.year_taken <= academic_year

    attempts.push({
      attempt_id: crypto.randomUUID(),
      course_code: catalogueCourse.course_code,
      display_code: catalogueCourse.display_code,
      subject: catalogueCourse.subject,
      course_number: catalogueCourse.course_number,
      course_level: catalogueCourse.course_level,
      course_title: catalogueCourse.course_title,
      credits: catalogueCourse.credits,
      status: isCompleted ? 'completed' : 'planned',
      grade: isCompleted ? 'P' : '',
      percentage: null,
      year_taken: entry.year_taken as PlannerYear,
      term_taken: mapFirstTermOffered(catalogueCourse.terms_offered),
      source: 'synthetic',
    })
  }

  return attempts
}
