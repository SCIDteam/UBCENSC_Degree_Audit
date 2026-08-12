export type Unit = 'credits' | 'categories' | 'course'
export type Metric = (
    'required_course' |
    'eligible_course' |

    'min_total_credits' |
    'min_science_credits' |
    'min_arts_credits' |
    'min_communication_credits' |
    'max_other_faculty_credits' |

    'min_upper_level_credits' |
    'min_upper_level_science_credits' |
    'min_science_credits_at_level' |
    'min_science_credits_at_or_above_level' |

    'min_breadth_categories' |
    'one_course_from_list' |
    'one_lab_course'
)
export type ApplicableProgram = "All" | "Major" | "Honours"

export type BaseRule = {
    metric: Metric
    value: number
    unit: Unit
    notes: string
}

export interface FacultyRequirements extends BaseRule {
    id: string
    applicable_program: ApplicableProgram
}

export interface CourseRules extends BaseRule {
    id: string
    applicable_program: ApplicableProgram
    calendar_year: string
    course_code: string
}

export interface PromotionRules extends BaseRule {
    id: string
    promotion_to: number
    course_level_min: string
    course_level_max: string
    science_only: boolean
}

export interface CourseRequirements extends BaseRule {
    id: string
    program: string
    applicable_program: ApplicableProgram
    calendar_year: string
}

export interface SpecializationRequirementGroup {
    group_id: string
    program: string
    calendar_year: string
    program_type: string
    year_level: string | null

    requirement_area: string

    option_id: string | null
    option_name: string | null
    option_name_raw: string | null

    theme: string | null
    is_recommended: boolean

    label: string
    credits: number | null

    rule_type: string
    rule_value: number | null
    rule_subject: string | null
    include_pattern: string | null
    exclude_pattern: string | null
    rule_unit: string | null

    source_text: string
    unit: string
}

export interface SpecializationRequirementCourse {
    group_id: string
    program: string
    calendar_year: string
    program_type: string
    year_level: string | null

    requirement_area: string

    option_id: string | null
    option_name: string | null
    option_name_raw: string | null

    theme: string | null
    is_recommended: boolean

    label: string
    credits: number | null

    rule_type: string
    rule_value: number | null
    rule_subject: string | null
    include_pattern: string | null
    exclude_pattern: string | null
    rule_unit: string | null

    course_code: string
    source_text: string
}

export interface AllocationConfigRule {
    bucket: string
    priority: number
    display_name: string
    requirement_areas: string
    canonical_rule_types: string | null
    notes: string
}

export type AllocationConfigs = Record<string, AllocationConfigRule[]>