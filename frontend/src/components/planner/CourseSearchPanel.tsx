import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AlertCircle, Search } from 'lucide-react'
import type { CatalogueCourse } from '../../types/courseCatalogue'

export type CourseSearchPanelHandle = {
  focusInput: () => void
  focusLastResult: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; courses: CatalogueCourse[] }

const RESULT_LIMIT = 50

function normalize(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function rankCourse(course: CatalogueCourse, normalizedQuery: string) {
  const codeNorm = normalize(course.course_code)
  const subjectNorm = normalize(course.subject)

  if (codeNorm === normalizedQuery) return 0
  if (codeNorm.startsWith(normalizedQuery)) return 1
  if (subjectNorm.startsWith(normalizedQuery)) return 2
  return 3
}

function matchesCourse(course: CatalogueCourse, normalizedQuery: string) {
  return (
    normalize(course.course_code).includes(normalizedQuery) ||
    normalize(course.display_code).includes(normalizedQuery) ||
    normalize(course.subject).includes(normalizedQuery)
  )
}

function CourseResult({
  course,
  onSelect,
}: {
  course: CatalogueCourse
  onSelect: (course: CatalogueCourse, element: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => onSelect(course, e.currentTarget)}
      className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-heading text-[11px] font-bold text-foreground">
          {course.display_code}
        </span>
        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
          {course.subject}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{course.course_title}</p>
      <span className="text-[10px] text-muted-foreground/70">
        {course.credits} cr · {course.course_level}-level
      </span>
    </button>
  )
}

const CourseSearchPanel = forwardRef<
  CourseSearchPanelHandle,
  { onSelectCourse: (course: CatalogueCourse) => void }
>(function CourseSearchPanel({ onSelectCourse }, ref) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const lastResultRef = useRef<HTMLButtonElement | null>(null)

  useImperativeHandle(ref, () => ({
    focusInput: () => inputRef.current?.focus(),
    focusLastResult: () => lastResultRef.current?.focus(),
  }))

  const handleResultSelect = (course: CatalogueCourse, element: HTMLButtonElement) => {
    lastResultRef.current = element
    onSelectCourse(course)
  }

  useEffect(() => {
    let cancelled = false

    fetch(`${import.meta.env.BASE_URL}data/course-catalogue.json`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load course catalogue')
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        if (!Array.isArray(data)) throw new Error('Course catalogue is not an array')
        setLoadState({ status: 'ready', courses: data as CatalogueCourse[] })
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const normalizedQuery = normalize(query)

  const results = useMemo(() => {
    if (loadState.status !== 'ready' || !normalizedQuery) return []
    return loadState.courses
      .filter((course) => matchesCourse(course, normalizedQuery))
      .sort((a, b) => {
        const rankDiff = rankCourse(a, normalizedQuery) - rankCourse(b, normalizedQuery)
        if (rankDiff !== 0) return rankDiff
        return a.course_code.localeCompare(b.course_code)
      })
      .slice(0, RESULT_LIMIT)
  }, [loadState, normalizedQuery])

  return (
    <div className="flex w-full flex-shrink-0 flex-col overflow-hidden border-b border-border bg-card lg:w-[272px] lg:border-b-0 lg:border-r">
      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">Add Courses</h2>
      </div>
      <div className="flex-shrink-0 px-3 pb-2 pt-3">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loadState.status !== 'ready'}
            placeholder="Search by course code"
            aria-label="Search by course code"
            className="w-full rounded-md border border-border bg-input-background py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {loadState.status === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">Loading course catalogue…</p>
          </div>
        )}

        {loadState.status === 'error' && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <AlertCircle size={20} className="text-destructive/60" />
            <p className="text-xs text-destructive">
              Could not load the course catalogue. Please try again later.
            </p>
          </div>
        )}

        {loadState.status === 'ready' && !normalizedQuery && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <Search size={22} className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Search by course code (e.g. NRES 225) to add courses to your plan.
            </p>
          </div>
        )}

        {loadState.status === 'ready' && normalizedQuery && results.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <AlertCircle size={18} className="text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No courses match your search.</p>
          </div>
        )}

        {loadState.status === 'ready' && normalizedQuery && results.length > 0 && (
          <div className="space-y-0.5">
            {results.map((course) => (
              <CourseResult
                key={course.course_code}
                course={course}
                onSelect={handleResultSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

export default CourseSearchPanel
