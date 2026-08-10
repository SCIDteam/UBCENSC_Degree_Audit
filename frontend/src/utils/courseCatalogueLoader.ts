import type { CatalogueCourse } from '../types/courseCatalogue'

let cataloguePromise: Promise<CatalogueCourse[]> | null = null

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isCatalogueCourse(value: unknown): value is CatalogueCourse {
  if (!value || typeof value !== 'object') return false
  const course = value as Record<string, unknown>
  return (
    typeof course.course_code === 'string' &&
    typeof course.display_code === 'string' &&
    typeof course.is_science_credit === 'boolean' &&
    typeof course.is_arts_credit === 'boolean' &&
    typeof course.is_upper_level === 'boolean' &&
    isStringArray(course.breadth_categories) &&
    typeof course.is_communication_course === 'boolean' &&
    typeof course.is_lab_course === 'boolean' &&
    isStringArray(course.classification_notes)
  )
}

export function loadCourseCatalogue(): Promise<CatalogueCourse[]> {
  if (!cataloguePromise) {
    cataloguePromise = fetch(`${import.meta.env.BASE_URL}data/course-catalogue.json`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load course catalogue')
        return response.json()
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Course catalogue is not an array')
        return data.filter(isCatalogueCourse)
      })
      .catch((error) => {
        cataloguePromise = null
        throw error
      })
  }
  return cataloguePromise
}
