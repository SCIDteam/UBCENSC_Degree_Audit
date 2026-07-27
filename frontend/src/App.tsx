import { useEffect, useRef, useState } from 'react'
import SetupScreen from './screens/SetupScreen'
import PlannerScreen from './screens/PlannerScreen'
import type { StudentSetupProfile } from './types/studentProfile'
import type { CourseAttempt } from './types/coursePlan'
import { buildRecommendedAttempts } from './data/recommendedPlan'

type AppScreen = 'setup' | 'planner'

function App() {
  const [screen, setScreen] = useState<AppScreen>('setup')
  const [profile, setProfile] = useState<StudentSetupProfile | null>(null)
  const [attempts, setAttempts] = useState<CourseAttempt[]>([])
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

  if (screen === 'planner' && profile) {
    return (
      <PlannerScreen
        profile={profile}
        attempts={attempts}
        onAddAttempt={addAttempt}
        onUpdateAttempt={updateAttempt}
        onDeleteAttempt={deleteAttempt}
        onBack={() => setScreen('setup')}
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
