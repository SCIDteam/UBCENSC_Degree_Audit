import { useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { academicYears, concentrations, programs } from '../data/setupOptions'
import type { StudentSetupProfile } from '../types/studentProfile'
import type { CourseAttempt, PlannerTerm, PlannerYear } from '../types/coursePlan'
import type { CatalogueCourse } from '../types/courseCatalogue'
import CourseSearchPanel, {
  type CourseSearchPanelHandle,
} from '../components/planner/CourseSearchPanel'
import AddCourseModal from '../components/planner/AddCourseModal'
import CourseCard from '../components/planner/CourseCard'

const PLANNER_SECTIONS: { id: PlannerYear; label: string }[] = [
  { id: 1, label: 'Year 1' },
  { id: 2, label: 'Year 2' },
  { id: 3, label: 'Year 3' },
  { id: 4, label: 'Year 4' },
  { id: 5, label: 'Future Plan' },
]

const PLANNER_TERMS: { id: PlannerTerm; label: string }[] = [
  { id: 'winter_1', label: 'Winter Term 1' },
  { id: 'winter_2', label: 'Winter Term 2' },
  { id: 'summer', label: 'Summer' },
]

function normalizeCourseCode(code: string) {
  return code.trim().toUpperCase()
}

function resolveProgramLabel(code: StudentSetupProfile['program']) {
  return programs.find((program) => program.code === code)?.name ?? code
}

function resolveConcentrationLabel(optionId: StudentSetupProfile['option_id']) {
  return concentrations.find((concentration) => concentration.optionId === optionId)?.name ?? optionId
}

function resolveAcademicYearLabel(value: StudentSetupProfile['academic_year']) {
  return academicYears.find((year) => year.value === value)?.label ?? String(value)
}

function HeaderBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

function TermColumn({
  label,
  attempts,
  repeatCodes,
  onAddClick,
  onDeleteAttempt,
}: {
  label: string
  attempts: CourseAttempt[]
  repeatCodes: Set<string>
  onAddClick: () => void
  onDeleteAttempt: (attemptId: string) => void
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-background/50">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-heading text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {attempts.length === 0 ? (
          <div className="flex min-h-[60px] flex-1 items-center justify-center rounded-md border-2 border-dashed border-border/60">
            <span className="text-[11px] text-muted-foreground/50">No courses</span>
          </div>
        ) : (
          attempts.map((attempt) => (
            <CourseCard
              key={attempt.attempt_id}
              attempt={attempt}
              isRepeat={repeatCodes.has(normalizeCourseCode(attempt.course_code))}
              onDelete={onDeleteAttempt}
            />
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onAddClick}
        className="flex w-full flex-shrink-0 items-center gap-1 rounded-b-lg border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-primary"
      >
        <Plus size={10} />
        Add course
      </button>
    </div>
  )
}

function PlannerSection({
  id,
  label,
  expanded,
  attempts,
  repeatCodes,
  onToggle,
  onAddClick,
  onDeleteAttempt,
}: {
  id: PlannerYear
  label: string
  expanded: boolean
  attempts: CourseAttempt[]
  repeatCodes: Set<string>
  onToggle: () => void
  onAddClick: (year: PlannerYear, term: PlannerTerm) => void
  onDeleteAttempt: (attemptId: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {expanded ? (
          <ChevronDown size={14} className="flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="flex-shrink-0 text-muted-foreground" />
        )}
        <span className="font-heading flex-1 text-sm font-semibold text-foreground">{label}</span>
      </button>
      {expanded && (
        <div className="grid grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-3">
          {PLANNER_TERMS.map((term) => (
            <TermColumn
              key={term.id}
              label={term.label}
              attempts={attempts.filter(
                (attempt) => attempt.year_taken === id && attempt.term_taken === term.id,
              )}
              repeatCodes={repeatCodes}
              onAddClick={() => onAddClick(id, term.id)}
              onDeleteAttempt={onDeleteAttempt}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlannerScreen({
  profile,
  attempts,
  onAddAttempt,
  onDeleteAttempt,
  onBack,
}: {
  profile: StudentSetupProfile
  attempts: CourseAttempt[]
  onAddAttempt: (attempt: CourseAttempt) => void
  onDeleteAttempt: (attemptId: string) => void
  onBack: () => void
}) {
  const [expanded, setExpanded] = useState<Set<PlannerYear>>(new Set([1]))
  const [modalCourse, setModalCourse] = useState<CatalogueCourse | null>(null)
  const [modalPlacement, setModalPlacement] = useState<{ year: PlannerYear; term: PlannerTerm }>({
    year: 1,
    term: 'winter_1',
  })
  const preferredPlacementRef = useRef<{ year: PlannerYear; term: PlannerTerm } | null>(null)
  const searchPanelRef = useRef<CourseSearchPanelHandle>(null)

  const studentYear: PlannerYear =
    typeof profile.academic_year === 'number' ? (profile.academic_year as PlannerYear) : 1

  const repeatCodes = new Set<string>()
  const seenCodes = new Set<string>()
  for (const attempt of attempts) {
    const normalized = normalizeCourseCode(attempt.course_code)
    if (seenCodes.has(normalized)) {
      repeatCodes.add(normalized)
    }
    seenCodes.add(normalized)
  }

  const toggleSection = (id: PlannerYear) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleAddCourseClick = (year: PlannerYear, term: PlannerTerm) => {
    preferredPlacementRef.current = { year, term }
    searchPanelRef.current?.focusInput()
  }

  const handleSelectCourse = (course: CatalogueCourse) => {
    const placement = preferredPlacementRef.current ?? { year: studentYear, term: 'winter_1' as PlannerTerm }
    preferredPlacementRef.current = null
    setModalPlacement(placement)
    setModalCourse(course)
  }

  const closeModal = () => {
    setModalCourse(null)
    searchPanelRef.current?.focusLastResult()
  }

  const handleConfirmAttempt = (attempt: CourseAttempt) => {
    onAddAttempt(attempt)
    setExpanded((prev) => new Set(prev).add(attempt.year_taken))
    setModalCourse(null)
    searchPanelRef.current?.focusLastResult()
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex h-[52px] items-center gap-3 px-4">
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <BookOpen size={13} className="text-primary-foreground" />
            </div>
            <span className="font-heading hidden text-sm font-semibold text-foreground sm:block">
              ENSC Degree Auditor
            </span>
          </div>
          <div className="hidden h-4 w-px flex-shrink-0 bg-border md:block" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <HeaderBadge>{profile.calendar_year}</HeaderBadge>
            <HeaderBadge>
              {resolveProgramLabel(profile.program)} {profile.program_type}
            </HeaderBadge>
            <HeaderBadge>{resolveConcentrationLabel(profile.option_id)}</HeaderBadge>
            <HeaderBadge>{resolveAcademicYearLabel(profile.academic_year)}</HeaderBadge>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Back
            </button>
            <button
              type="button"
              disabled
              className="font-heading cursor-not-allowed rounded-md bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Run Audit
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <CourseSearchPanel ref={searchPanelRef} onSelectCourse={handleSelectCourse} />

        <main className="min-w-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {PLANNER_SECTIONS.map((section) => (
            <PlannerSection
              key={section.id}
              id={section.id}
              label={section.label}
              expanded={expanded.has(section.id)}
              attempts={attempts}
              repeatCodes={repeatCodes}
              onToggle={() => toggleSection(section.id)}
              onAddClick={handleAddCourseClick}
              onDeleteAttempt={onDeleteAttempt}
            />
          ))}
        </main>
      </div>

      {modalCourse && (
        <AddCourseModal
          course={modalCourse}
          defaultYear={modalPlacement.year}
          defaultTerm={modalPlacement.term}
          existingAttempts={attempts}
          onConfirm={handleConfirmAttempt}
          onDismiss={closeModal}
        />
      )}
    </div>
  )
}
