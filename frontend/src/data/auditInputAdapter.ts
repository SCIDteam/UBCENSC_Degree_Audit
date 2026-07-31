import type { StudentSetupProfile } from '../types/studentProfile'
import type { CourseAttempt, PlannerTerm, PlannerYear, StoredCourseStatus } from '../types/coursePlan'
import type { AuditCourseInput, AuditInput, AuditProfileInput } from '../types/audit'
import type { CalendarYear } from './setupOptions'

const COUNTED_STATUSES: readonly StoredCourseStatus[] = ['completed', 'in_progress', 'planned']

const CALENDAR_YEAR_PATTERN = /^(\d{4})-(\d{4})$/

export function toAbsoluteTerm(
  calendarYear: CalendarYear,
  yearTaken: PlannerYear,
  termTaken: PlannerTerm,
): string {
  const match = CALENDAR_YEAR_PATTERN.exec(calendarYear)
  if (!match) {
    throw new Error(`toAbsoluteTerm: malformed calendar_year "${calendarYear}"`)
  }

  const baseYear = Number(match[1])
  const endYear = Number(match[2])
  if (endYear !== baseYear + 1) {
    throw new Error(`toAbsoluteTerm: malformed calendar_year "${calendarYear}"`)
  }

  const yearOffset = yearTaken - 1

  switch (termTaken) {
    case 'winter_1':
      return `${baseYear + yearOffset}W1`
    case 'winter_2':
      return `${baseYear + yearOffset + 1}W2`
    case 'summer':
      return `${baseYear + yearOffset + 1}S`
    default:
      throw new Error(`toAbsoluteTerm: unsupported term_taken "${termTaken}"`)
  }
}

function buildProfileInput(profile: StudentSetupProfile): AuditProfileInput {
  const { calendar_year, program, program_type, option_id, academic_year } = profile
  if (!calendar_year || !program || !program_type || !option_id || academic_year === '') {
    throw new Error('buildAuditInput: profile is incomplete')
  }
  return { calendar_year, program, program_type, option_id, academic_year }
}

function buildCourseInput(attempt: CourseAttempt, calendarYear: CalendarYear): AuditCourseInput {
  return {
    attempt_id: attempt.attempt_id,
    course_code: attempt.course_code,
    status: attempt.status,
    credits: attempt.credits,
    year_taken: attempt.year_taken,
    term_taken: attempt.term_taken,
    absolute_term: toAbsoluteTerm(calendarYear, attempt.year_taken, attempt.term_taken),
    grade: attempt.grade,
    percentage: attempt.percentage,
    source: attempt.source,
    // Manual override support is deferred to a later feature; every
    // override field is neutral (null) in this prototype.
    override_course_code: null,
    override_exclusive_group_id: null,
    override_exclusive_requirement_area: null,
    override_allow_double_count: null,
    override_double_count_groups: null,
    override_note: null,
  }
}

export function buildAuditInput(
  profile: StudentSetupProfile,
  attempts: CourseAttempt[],
): AuditInput {
  const profileInput = buildProfileInput(profile)
  return {
    schema_version: 1,
    profile: profileInput,
    courses: attempts.map((attempt) => buildCourseInput(attempt, profileInput.calendar_year)),
    options: {
      audit_mode: 'planned',
      counted_statuses: [...COUNTED_STATUSES],
    },
  }
}
