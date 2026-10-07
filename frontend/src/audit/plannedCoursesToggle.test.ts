// Manual smoke-test script for the "Include planned courses" audit toggle
// (GitHub issue #9). Follows the same run-directly-with-tsx convention as
// testAudit.ts, since this repo has no test framework configured. Run with:
//   npx tsx src/audit/plannedCoursesToggle.test.ts
//
// Uses a tiny local assert helper rather than node:assert, since this file
// lives under src/ where tsconfig.app.json's "types" list has no Node types.

import { RunAudit, filterCountedCourses } from './runAudit'
import { SpecializationAuditor } from './specializationAuditor'
import { prepareAllocationRows } from './allocationEngine'
import type { CourseAttempt } from '../types/coursePlan'
import type { StudentSetupProfile } from '../types/studentProfile'
import type {
  SpecializationRequirementCourse,
  SpecializationRequirementGroup,
} from '../types/auditRules'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`PASS: ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL: ${name}`)
    console.error(error)
  }
}

function assertTruthy(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${String(expected)}, got ${String(actual)}`)
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(message ?? `expected ${expectedJson}, got ${actualJson}`)
  }
}

const studentProfile: StudentSetupProfile = {
  calendar_year: '2026-2027',
  program: 'ENSC',
  program_type: 'Major',
  option_id: '',
  academic_year: 1,
}

function makeAttempt(overrides: Partial<CourseAttempt>): CourseAttempt {
  return {
    course_code: 'TEST101',
    display_code: 'TEST 101',
    subject: 'TEST',
    course_number: '101',
    course_level: 100,
    course_title: 'Test Course',
    credits: 3,
    terms_offered: ['Winter Term 1'],
    prerequisite_text: '',
    corequisite_text: '',
    prerequisites: [],
    corequisites: [],
    is_science_credit: false,
    is_arts_credit: false,
    is_upper_level: false,
    is_communication_course: false,
    is_lab_course: false,
    breadth_categories: [],
    classification_notes: [],
    attempt_id: '1',
    status: 'completed',
    grade: 'P',
    percentage: 80,
    year_taken: 1,
    term_taken: 'winter_1',
    source: 'manual',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1 & 2. A planned course satisfies a requirement when the toggle is
// enabled, and does not satisfy it when the toggle is disabled.
// ---------------------------------------------------------------------------

const testGroup: SpecializationRequirementGroup = {
  group_id: 'TEST_REQUIRED_COURSE',
  program: 'ALL',
  calendar_year: 'ALL',
  program_type: 'ALL',
  year_level: null,
  requirement_area: 'Core',
  option_id: null,
  option_name: null,
  option_name_raw: null,
  theme: null,
  is_recommended: false,
  label: 'Test required course',
  credits: null,
  rule_type: 'required_course',
  rule_value: null,
  rule_subject: null,
  include_pattern: null,
  exclude_pattern: null,
  rule_unit: null,
  source_text: '',
  unit: 'course',
}

const testGroupCourse: SpecializationRequirementCourse = {
  group_id: 'TEST_REQUIRED_COURSE',
  program: 'ALL',
  calendar_year: 'ALL',
  program_type: 'ALL',
  year_level: null,
  requirement_area: 'Core',
  option_id: null,
  option_name: null,
  option_name_raw: null,
  theme: null,
  is_recommended: false,
  label: 'Test required course',
  credits: null,
  rule_type: 'required_course',
  rule_value: null,
  rule_subject: null,
  include_pattern: null,
  exclude_pattern: null,
  rule_unit: null,
  course_code: 'TEST101',
  source_text: '',
}

const plannedAttempt = makeAttempt({ status: 'planned', grade: '', percentage: null })

test('planned course satisfies requirement when toggle enabled', () => {
  const rows = SpecializationAuditor({
    classified_courses: [],
    specialization_requirement_groups: [testGroup],
    specialization_requirement_courses: [testGroupCourse],
    student_course_plan: [plannedAttempt],
    student_profile: studentProfile,
    include_planned_courses: true,
  })

  const row = rows.find((r) => r.group_id === 'TEST_REQUIRED_COURSE')
  assertTruthy(row, 'expected TEST_REQUIRED_COURSE row to be present')
  assertEqual(row!.status, 'satisfied')
  assertDeepEqual(row!.matched_courses, ['TEST101'])
})

test('planned course does not satisfy requirement when toggle disabled', () => {
  const rows = SpecializationAuditor({
    classified_courses: [],
    specialization_requirement_groups: [testGroup],
    specialization_requirement_courses: [testGroupCourse],
    student_course_plan: [plannedAttempt],
    student_profile: studentProfile,
    include_planned_courses: false,
  })

  const row = rows.find((r) => r.group_id === 'TEST_REQUIRED_COURSE')
  assertTruthy(row, 'expected TEST_REQUIRED_COURSE row to be present')
  assertEqual(row!.status, 'missing')
  assertDeepEqual(row!.matched_courses, [])
})

test('allocation engine counts a planned course only when toggle enabled', () => {
  const enabledRows = prepareAllocationRows([plannedAttempt], true)
  const disabledRows = prepareAllocationRows([plannedAttempt], false)

  assertEqual(enabledRows[0].counted, true)
  assertEqual(disabledRows[0].counted, false)
})

// ---------------------------------------------------------------------------
// 3. Existing audit behavior remains unchanged: completed and in-progress
// courses are counted the same way regardless of the toggle, and the
// default (toggle enabled) reproduces the previous unconditional filter.
// ---------------------------------------------------------------------------

const completedAttempt = makeAttempt({
  attempt_id: '2',
  course_code: 'COMPLETED101',
  status: 'completed',
  grade: 'P',
  percentage: 90,
})
const failedAttempt = makeAttempt({
  attempt_id: '3',
  course_code: 'FAILED101',
  status: 'completed',
  grade: 'F',
  percentage: 40,
})
const withdrawnAttempt = makeAttempt({
  attempt_id: '4',
  course_code: 'WITHDRAWN101',
  status: 'completed',
  grade: 'W',
  percentage: null,
})
const inProgressAttempt = makeAttempt({
  attempt_id: '5',
  course_code: 'INPROGRESS101',
  status: 'in_progress',
  grade: '',
  percentage: null,
})
const plannedForRegression = makeAttempt({
  attempt_id: '6',
  course_code: 'PLANNED101',
  status: 'planned',
  grade: '',
  percentage: null,
})

const mixedStatusPlan = [
  completedAttempt,
  failedAttempt,
  withdrawnAttempt,
  inProgressAttempt,
  plannedForRegression,
]

test('toggle enabled reproduces the previous unconditional counted-course filter', () => {
  const result = filterCountedCourses(mixedStatusPlan, true)
  assertDeepEqual(
    result.map((attempt) => attempt.course_code),
    ['COMPLETED101', 'INPROGRESS101', 'PLANNED101'],
  )
})

test('toggle disabled excludes only the planned course, leaving completed/in-progress behavior unchanged', () => {
  const result = filterCountedCourses(mixedStatusPlan, false)
  assertDeepEqual(
    result.map((attempt) => attempt.course_code),
    ['COMPLETED101', 'INPROGRESS101'],
  )
})

// ---------------------------------------------------------------------------
// End-to-end smoke test against the real rule data, to confirm RunAudit
// still executes successfully with both toggle values.
// ---------------------------------------------------------------------------

test('RunAudit executes end-to-end with the toggle enabled and disabled', () => {
  const plan: CourseAttempt[] = [completedAttempt, inProgressAttempt, plannedForRegression]

  const enabledResult = RunAudit({
    classified_courses: plan,
    student_course_plan: plan,
    student_profile: studentProfile,
    include_planned_courses: true,
  })
  const disabledResult = RunAudit({
    classified_courses: plan,
    student_course_plan: plan,
    student_profile: studentProfile,
    include_planned_courses: false,
  })

  assertDeepEqual(enabledResult.case_summary.counted_statuses, ['completed', 'in_progress', 'planned'])
  assertDeepEqual(disabledResult.case_summary.counted_statuses, ['completed', 'in_progress'])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  throw new Error(`${failed} test(s) failed`)
}
