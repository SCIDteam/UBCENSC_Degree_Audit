import { useEffect, useState } from 'react'
import SetupScreen from './screens/SetupScreen'
import PlannerScreen from './screens/PlannerScreen'
import AuditScreen from './screens/AuditScreen'
import { emptyStudentSetupProfile, type StudentSetupProfile } from './types/studentProfile'
import type { CourseAttempt } from './types/coursePlan'
import type { AuditInput, AuditResult } from './types/audit'
import { buildRecommendedAttempts, getRecommendedPlanKey } from './utils/recommendedPlan'
import { buildAuditInput } from './utils/auditInputAdapter'
import { loadCourseCatalogue } from './utils/courseCatalogueLoader'
import {
  applyCatalogueToAttempts,
  clearSavedSession,
  loadSavedSession,
  saveSession,
  type SavedScreen,
} from './utils/savedSession'
import { RunAudit as runAuditEngine } from './audit/runAudit'
// Temporary fixture standing in for the real browser audit calculator,
// which will replace this once AuditInput -> AuditResult is implemented.
import { exampleAuditResult } from './utils/exampleAuditResult'

const USE_DEVELOPMENT_AUDIT_ENGINE = true
type AppScreen = SavedScreen

function App() {
  // Inputs saved in this browser by an earlier visit, read once on first render.
  const [savedSession] = useState(loadSavedSession)
  // The audit result itself isn't saved, so a reload on the audit screen
  // returns to the planner, where Run Audit recreates it.
  const [screen, setScreen] = useState<AppScreen>(
    savedSession?.screen === 'audit' ? 'planner' : (savedSession?.screen ?? 'setup'),
  )
  const [setupDraft, setSetupDraft] = useState<StudentSetupProfile>(
    savedSession?.setup_draft ?? emptyStudentSetupProfile,
  )
  const [profile, setProfile] = useState<StudentSetupProfile | null>(savedSession?.profile ?? null)
  const [attempts, setAttempts] = useState<CourseAttempt[]>(savedSession?.attempts ?? [])
  const [auditInput, setAuditInput] = useState<AuditInput | null>(null)
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  // Preserves prior behavior, which always counted planned courses.
  const [includePlannedCourses, setIncludePlannedCourses] = useState(
    savedSession?.include_planned_courses ?? true,
  )
  // Recommended plan that `attempts` started from. Submitting Setup with the
  // same choices keeps the student's edits instead of reloading the plan.
  const [planKey, setPlanKey] = useState<string | null>(savedSession?.plan_key ?? null)

  const hasInputs =
    Object.values(setupDraft).some(Boolean) || profile !== null || attempts.length > 0

  useEffect(() => {
    if (!profile) return
    const nextPlanKey = getRecommendedPlanKey(profile)
    if (!nextPlanKey || nextPlanKey === planKey) return

    let cancelled = false
    buildRecommendedAttempts(profile)
      .then((recommendedAttempts) => {
        if (cancelled) return
        setAttempts(recommendedAttempts)
        setPlanKey(nextPlanKey)
      })
      .catch((error) => {
        console.error('[App] Failed to load recommended course plan', error)
      })

    return () => {
      cancelled = true
    }
  }, [profile, planKey])

  // Bring saved courses up to date with the current catalogue.
  useEffect(() => {
    if (!savedSession?.attempts.length) return

    let cancelled = false
    loadCourseCatalogue()
      .then((catalogue) => {
        if (cancelled) return
        setAttempts((prev) => applyCatalogueToAttempts(prev, catalogue))
      })
      .catch((error) => {
        console.error('[App] Failed to refresh saved courses from the catalogue', error)
      })

    return () => {
      cancelled = true
    }
  }, [savedSession])

  useEffect(() => {
    if (!hasInputs) {
      clearSavedSession()
      return
    }
    saveSession({
      screen,
      setup_draft: setupDraft,
      profile,
      plan_key: planKey,
      attempts,
      include_planned_courses: includePlannedCourses,
    })
  }, [hasInputs, screen, setupDraft, profile, planKey, attempts, includePlannedCourses])

  const resetInputs = () => {
    setSetupDraft(emptyStudentSetupProfile)
    setProfile(null)
    setAttempts([])
    setPlanKey(null)
    setIncludePlannedCourses(true)
    setAuditInput(null)
    setAuditResult(null)
    setAuditError(null)
    setScreen('setup')
  }

  const addAttempt = (attempt: CourseAttempt) => {
    setAttempts((prev) => [...prev, attempt])
  }

  const updateAttempt = (updatedAttempt: CourseAttempt) => {
    setAttempts((prev) =>
      prev.map((attempt) => (attempt.attempt_id === updatedAttempt.attempt_id ? updatedAttempt : attempt)),
    )
  }

  const deleteAttempt = (attemptId: string) => {
    setAttempts((prev) => prev.filter((attempt) => attempt.attempt_id !== attemptId))
  }

  const runAudit = () => {
    if (!profile) return
    try {
      const input = buildAuditInput(profile, attempts)
      const result = USE_DEVELOPMENT_AUDIT_ENGINE
        ? runAuditEngine({
          // Temporary integration test:
          // CourseAttempt extends CatalogueCourse, so attempts satisfy this
          // argument structurally. Replace this with the authoritative
          // catalogue collection if the finished engine actually needs it.
          classified_courses: attempts,
          student_course_plan: attempts,
          student_profile: profile,
          include_planned_courses: includePlannedCourses,
        })
        : exampleAuditResult

      setAuditInput(input)
      setAuditResult(result)
      setAuditError(null)
      setScreen('audit')
    } catch (error) {
      console.error('[App] Failed to run audit', error)
      setAuditError(
        error instanceof Error
          ? error.message
          : 'Unable to run audit for this course plan.',
      )
    }
  }
  if (
    screen === 'audit' &&
    profile &&
    auditInput &&
    auditResult
  ) {
    return (
      <AuditScreen
        profile={profile}
        auditInput={auditInput}
        auditResult={auditResult}
        onEditPlan={() => setScreen('planner')}
      />
    )
  }
  if (screen === 'planner' && profile) {
    return (
      <PlannerScreen
        profile={profile}
        attempts={attempts}
        onAddAttempt={addAttempt}
        onUpdateAttempt={updateAttempt}
        onDeleteAttempt={deleteAttempt}
        onBack={() => setScreen('setup')}
        onRunAudit={runAudit}
        auditError={auditError}
        onDismissAuditError={() => setAuditError(null)}
        includePlannedCourses={includePlannedCourses}
        onIncludePlannedCoursesChange={setIncludePlannedCourses}
      />
    )
  }

  return (
    <SetupScreen
      profile={setupDraft}
      onProfileChange={setSetupDraft}
      savedPlanKey={planKey}
      canReset={hasInputs}
      onReset={resetInputs}
      onComplete={(completedProfile) => {
        setProfile(completedProfile)
        setScreen('planner')
      }}
    />
  )
}

export default App
