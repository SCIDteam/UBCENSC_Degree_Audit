export const calendarYears = [
  "2024-2025",
  "2026-2027",
] as const;

export const programs = [
  {
    code: "ENSC",
    name: "Environmental Sciences (ENSC)",
  },
] as const;

export const programTypes = [
  "Major",
  "Honours",
] as const;

// optionId matches the option_id values used in course_requirements
// requirement_groups.csv and the student_profile.csv input contract.
export const concentrations = [
  { optionId: "LAND_AIR_WATER", name: "Land, Air, and Water" },
  { optionId: "ECOLOGY_CONSERVATION", name: "Ecology and Conservation" },
  { optionId: "ENERGY_TRANSITIONS_SUSTAINABILITY", name: "Energy Transitions and Sustainability" },
  { optionId: "ENVIRONMENTAL_IMPACTS_HUMAN_HEALTH", name: "Environmental Impacts on Human Health" },
  { optionId: "ENVIRONMENTAL_ANALYTICS", name: "Environmental Analytics" },
] as const;

// value matches the numeric academic_year value expected in student_profile.csv.
export const academicYears = [
  { value: 1, label: "Year 1" },
  { value: 2, label: "Year 2" },
  { value: 3, label: "Year 3" },
  { value: 4, label: "Year 4" },
  { value: 5, label: "Year 5+" },
] as const;

export type CalendarYear =
  (typeof calendarYears)[number];

export type ProgramCode =
  (typeof programs)[number]["code"];

export type ProgramType =
  (typeof programTypes)[number];

export type OptionId =
  (typeof concentrations)[number]["optionId"];

export type AcademicYearValue =
  (typeof academicYears)[number]["value"];
