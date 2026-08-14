import type {
    AllocationConfigs,
    AllocationConfigRule,
    SpecializationRequirementCourse,
    SpecializationRequirementGroup,
} from '../types/auditRules'
import type { StudentSetupProfile } from '../types/studentProfile'

interface SpecializationRequirementResolverProps {
    requirementGroups: SpecializationRequirementGroup[]
    requirementCourses: SpecializationRequirementCourse[]
    studentProfile: StudentSetupProfile
}

export class SpecializationRequirementResolver {
    private readonly requirementGroups: SpecializationRequirementGroup[]
    private readonly requirementCourses: SpecializationRequirementCourse[]
    private readonly studentProfile: StudentSetupProfile

    constructor({
        requirementGroups,
        requirementCourses,
        studentProfile,
    }: SpecializationRequirementResolverProps) {
        this.requirementGroups = requirementGroups
        this.requirementCourses = requirementCourses
        this.studentProfile = studentProfile
    }

    private splitSemicolon(value: string | null): string[] {
        if (!value) {
            return []
        }

        return value
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
    }

    private getLevelBounds(
        includePattern: string | null,
    ): { min: number | null; max: number | null } {
        if (!includePattern) {
            return {
                min: null,
                max: null,
            }
        }

        const match = includePattern
            .trim()
            .toLowerCase()
            .match(/^(\d)00-level$/)

        if (!match) {
            return {
                min: null,
                max: null,
            }
        }

        const min = Number(match[1]) * 100

        return {
            min,
            max: min + 99,
        }
    }

    courseMatchesLevelRequirement(
        courseSubject: string,
        courseNumber: string,
        requirement: SpecializationRequirementGroup,
    ): boolean {
        const allowedSubjects = this.splitSemicolon(
            requirement.rule_subject,
        )

        const excludedCourseCodes = this.splitSemicolon(
            requirement.exclude_pattern,
        )

        const { min, max } = this.getLevelBounds(
            requirement.include_pattern,
        )

        if (min === null || max === null) {
            return false
        }

        const normalizedSubject = courseSubject.trim().toUpperCase()
        const normalizedNumber = courseNumber.trim()

        const courseCode =
            `${normalizedSubject}${normalizedNumber}`

        const normalizedSubjects = new Set(
            allowedSubjects.map(
                (subject) => subject.trim().toUpperCase(),
            ),
        )

        if (!normalizedSubjects.has(normalizedSubject)) {
            return false
        }

        if (
            excludedCourseCodes.some(
                (excludedCode) =>
                    excludedCode
                        .replaceAll('_V', '')
                        .replaceAll(' ', '')
                        .toUpperCase() === courseCode,
            )
        ) {
            return false
        }

        const numericCourseNumber =
            Number.parseInt(normalizedNumber, 10)

        if (Number.isNaN(numericCourseNumber)) {
            return false
        }

        if (
            numericCourseNumber < min ||
            numericCourseNumber > max
        ) {
            return false
        }

        return true
    }

    getAllocationConfigForCalendar(
        allocationConfigs: AllocationConfigs,
    ): AllocationConfigRule[] {
        return allocationConfigs[this.studentProfile.calendar_year] ?? []
    }

    getBucketForRequirement(
        requirement: SpecializationRequirementGroup,
        allocationConfig: AllocationConfigRule[],
    ): string | null {
        for (const config of allocationConfig) {
            const requirementAreas = this.splitSemicolon(
                config.requirement_areas,
            )

            const canonicalRuleTypes = this.splitSemicolon(
                config.canonical_rule_types,
            )

            if (
                requirementAreas.includes(requirement.requirement_area) ||
                canonicalRuleTypes.includes(requirement.rule_type)
            ) {
                return config.bucket
            }
        }

        return null
    }

    getGroupsByRequirementArea(
        requirementArea: string,
    ): SpecializationRequirementGroup[] {
        return this.getApplicableRequirementGroups().filter(
            (group) => group.requirement_area === requirementArea,
        )
    }

    getApplicableRequirementGroups(): SpecializationRequirementGroup[] {
        return this.requirementGroups.filter((group) => {
            const matchesProgram =
                group.program === this.studentProfile.program ||
                group.program === 'ALL' ||
                group.program === ''

            const matchesCalendar =
                group.calendar_year === this.studentProfile.calendar_year ||
                group.calendar_year === 'ALL' ||
                group.calendar_year === ''

            const matchesProgramType =
                group.program_type === this.studentProfile.program_type ||
                group.program_type === 'All' ||
                group.program_type === 'ALL' ||
                group.program_type === ''

            const matchesOption =
                group.option_id === null ||
                group.option_id === '' ||
                group.option_id === this.studentProfile.option_id

            const isRecommended = group.is_recommended === true

            return (
                matchesProgram &&
                matchesCalendar &&
                matchesProgramType &&
                matchesOption &&
                !isRecommended
            )
        })
    }

    getGroupMetadata(
        groupId: string,
    ): SpecializationRequirementGroup | undefined {
        return this.requirementGroups.find(
            (group) => group.group_id === groupId,
        )
    }

    getGroupCourseCodes(groupId: string): string[] {
        return this.requirementCourses
            .filter((course) => course.group_id === groupId)
            .map((course) => course.course_code)
    }

    getCourseCodesForGroups(groupIds: string[]): string[] {
        const groupIdSet = new Set(groupIds)

        return Array.from(
            new Set(
                this.requirementCourses
                    .filter((course) => groupIdSet.has(course.group_id))
                    .map((course) => course.course_code),
            ),
        )
    }

    getOptionEligibleCourseCodes(optionId: string): string[] {
        return Array.from(
            new Set(
                this.requirementCourses
                    .filter((course) => {
                        const matchesProgram =
                            course.program === this.studentProfile.program ||
                            course.program === 'ALL' ||
                            course.program === ''

                        const matchesCalendar =
                            course.calendar_year === this.studentProfile.calendar_year ||
                            course.calendar_year === 'ALL' ||
                            course.calendar_year === ''

                        const matchesProgramType =
                            course.program_type === this.studentProfile.program_type ||
                            course.program_type === 'All' ||
                            course.program_type === 'ALL' ||
                            course.program_type === ''

                        const matchesOption = course.option_id === optionId

                        const matchesRequirementArea =
                            course.requirement_area === 'Area of Concentration'

                        return (
                            matchesProgram &&
                            matchesCalendar &&
                            matchesProgramType &&
                            matchesOption &&
                            matchesRequirementArea
                        )
                    })
                    .map((course) => course.course_code),
            ),
        )
    }

    // Groups Area of Concentration eligible course codes by theme for the
    // given option. Mirrors Tim's requirement_courses filter inside
    // _audit_theme_minimum: requirement_area === 'Area of Concentration',
    // matching option_id, and non-empty theme. Unlike
    // getOptionEligibleCourseCodes, is_recommended is intentionally NOT
    // filtered here, matching Tim's theme_minimum behavior of letting
    // recommended AoC rows contribute to theme coverage.
    getOptionCoursesByTheme(optionId: string): Map<string, string[]> {
        const coursesByTheme = new Map<string, string[]>()

        for (const course of this.requirementCourses) {
            if (course.requirement_area !== 'Area of Concentration') {
                continue
            }

            if (course.option_id !== optionId) {
                continue
            }

            const theme = (course.theme ?? '').trim()

            if (theme === '') {
                continue
            }

            const matchesProgram =
                course.program === this.studentProfile.program ||
                course.program === 'ALL' ||
                course.program === ''

            const matchesCalendar =
                course.calendar_year === this.studentProfile.calendar_year ||
                course.calendar_year === 'ALL' ||
                course.calendar_year === ''

            const matchesProgramType =
                course.program_type === this.studentProfile.program_type ||
                course.program_type === 'All' ||
                course.program_type === 'ALL' ||
                course.program_type === ''

            if (!matchesProgram || !matchesCalendar || !matchesProgramType) {
                continue
            }

            const existing = coursesByTheme.get(theme)

            if (existing) {
                existing.push(course.course_code)
            } else {
                coursesByTheme.set(theme, [course.course_code])
            }
        }

        return coursesByTheme
    }

    getComplementaryStudiesEligibleCourseCodes(): string[] {
        return Array.from(
            new Set(
                this.requirementCourses
                    .filter((course) => {
                        const matchesProgram =
                            course.program === this.studentProfile.program ||
                            course.program === 'ALL' ||
                            course.program === ''

                        const matchesCalendar =
                            course.calendar_year === this.studentProfile.calendar_year ||
                            course.calendar_year === 'ALL' ||
                            course.calendar_year === ''

                        const matchesProgramType =
                            course.program_type === this.studentProfile.program_type ||
                            course.program_type === 'All' ||
                            course.program_type === 'ALL' ||
                            course.program_type === ''

                        return (
                            matchesProgram &&
                            matchesCalendar &&
                            matchesProgramType &&
                            course.requirement_area === 'Complementary Studies'
                        )
                    })
                    .map((course) => course.course_code),
            ),
        )
    }

    courseMatchesAnyEligible(
        courseCode: string,
        eligibleCourseCodes: string[],
    ): boolean {
        return eligibleCourseCodes.some((eligibleCode) =>
            this.courseMatchesPattern(courseCode, eligibleCode),
        )
    }

    private courseMatchesPattern(
        courseCode: string,
        eligibleCode: string,
    ): boolean {
        if (eligibleCode.endsWith('*')) {
            return courseCode.startsWith(
                eligibleCode.slice(0, -1),
            )
        }

        return courseCode === eligibleCode
    }
}