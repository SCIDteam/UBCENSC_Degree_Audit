import type {
  AcademicYearValue,
  CalendarYear,
  OptionId,
  ProgramCode,
  ProgramType,
} from '../data/setupOptions'

// Mirrors the fields of student_profile.csv that are collected by the
// Student Setup screen. Field names and value formats match that contract
// so this object can be written out as-is by the CSV export step later.
export interface StudentSetupProfile {
  calendar_year: CalendarYear | ''
  program: ProgramCode | ''
  program_type: ProgramType | ''
  option_id: OptionId | ''
  academic_year: AcademicYearValue | ''
  start_date: string
}

export const emptyStudentSetupProfile: StudentSetupProfile = {
  calendar_year: '',
  program: '',
  program_type: '',
  option_id: '',
  academic_year: '',
  start_date: '',
}
