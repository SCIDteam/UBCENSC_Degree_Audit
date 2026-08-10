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
const LAND_AIR_WATER = { optionId: "LAND_AIR_WATER", name: "Land, Air, and Water" } as const;
const ECOLOGY_CONSERVATION = { optionId: "ECOLOGY_CONSERVATION", name: "Ecology and Conservation" } as const;
const SUSTAINABILITY_SCIENCE = { optionId: "SUSTAINABILITY_SCIENCE", name: "Sustainability Science" } as const;
const ENERGY_TRANSITIONS_SUSTAINABILITY = { optionId: "ENERGY_TRANSITIONS_SUSTAINABILITY", name: "Energy Transitions and Sustainability" } as const;
const ENVIRONMENTAL_IMPACTS_HUMAN_HEALTH = { optionId: "ENVIRONMENTAL_IMPACTS_HUMAN_HEALTH", name: "Environmental Impacts on Human Health" } as const;
const ENVIRONMENTAL_ANALYTICS = { optionId: "ENVIRONMENTAL_ANALYTICS", name: "Environmental Analytics" } as const;

export const concentrations = [
  LAND_AIR_WATER,
  ECOLOGY_CONSERVATION,
  SUSTAINABILITY_SCIENCE,
  ENERGY_TRANSITIONS_SUSTAINABILITY,
  ENVIRONMENTAL_IMPACTS_HUMAN_HEALTH,
  ENVIRONMENTAL_ANALYTICS,
] as const;

// Area of Concentration options differ by calendar year. Keep this map as
// the single source of truth for per-year availability; entries reference
// the same objects as `concentrations` above rather than duplicating data.
export const concentrationsByCalendarYear = {
  "2024-2025": [LAND_AIR_WATER, ECOLOGY_CONSERVATION, SUSTAINABILITY_SCIENCE],
  "2026-2027": [
    LAND_AIR_WATER,
    ECOLOGY_CONSERVATION,
    ENERGY_TRANSITIONS_SUSTAINABILITY,
    ENVIRONMENTAL_IMPACTS_HUMAN_HEALTH,
    ENVIRONMENTAL_ANALYTICS,
  ],
} as const satisfies Record<(typeof calendarYears)[number], readonly (typeof concentrations)[number][]>;

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
