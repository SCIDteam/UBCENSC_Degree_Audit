import { useEffect, useRef, useState } from 'react'
import SetupScreen from './screens/SetupScreen'
import PlannerScreen from './screens/PlannerScreen'
import AuditScreen from './screens/AuditScreen'
import type { StudentSetupProfile } from './types/studentProfile'
import type { CourseAttempt } from './types/coursePlan'
import type { AuditInput, AuditResult } from './types/audit'
import { buildRecommendedAttempts } from './data/recommendedPlan'
import { buildAuditInput } from './data/auditInputAdapter'
// Temporary fixture standing in for the real browser audit calculator,
// which will replace this once AuditInput -> AuditResult is implemented.
import { exampleAuditResult } from './data/exampleAuditResult'

type AppScreen = 'setup' | 'planner' | 'audit'

function App() {
  const [screen, setScreen] = useState<AppScreen>('setup')
  const [profile, setProfile] = useState<StudentSetupProfile | null>(null)
  const [attempts, setAttempts] = useState<CourseAttempt[]>([])
  const [auditInput, setAuditInput] = useState<AuditInput | null>(null)
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const initializedPlanKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!profile) return
    const { calendar_year, program_type, option_id, academic_year } = profile
    if (!calendar_year || !program_type || !option_id || typeof academic_year !== 'number') {
      return
    }

    const planKey = `${calendar_year}|${program_type}|${option_id}`
    if (initializedPlanKeyRef.current === planKey) return
    initializedPlanKeyRef.current = planKey

    let cancelled = false
    buildRecommendedAttempts(profile)
      .then((recommendedAttempts) => {
        if (cancelled) return
        setAttempts(recommendedAttempts)
      })
      .catch((error) => {
        console.error('[App] Failed to load recommended course plan', error)
      })

    return () => {
      cancelled = true
    }
  }, [profile])

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
      setAuditInput(input)
      setAuditResult(exampleAuditResult)
      setAuditError(null)
      setScreen('audit')
    } catch (error) {
      console.error('[App] Failed to build audit input', error)
      setAuditError(error instanceof Error ? error.message : 'Unable to run audit for this course plan.')
    }
  }

  if (screen === 'audit' && profile && auditInput && auditResult) {
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
      />
    )
  }

  return (
    <SetupScreen
      initialProfile={profile ?? undefined}
      onComplete={(completedProfile) => {
        setProfile(completedProfile)
        setScreen('planner')
      }}
    />
  )
}

export default App
