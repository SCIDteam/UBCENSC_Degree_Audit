import type {
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

                        return (
                            matchesProgram &&
                            matchesCalendar &&
                            matchesProgramType &&
                            matchesOption
                        )
                    })
                    .map((course) => course.course_code),
            ),
        )
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