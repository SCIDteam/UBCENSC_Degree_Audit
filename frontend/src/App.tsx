import { useState } from 'react'
import SetupScreen from './screens/SetupScreen'
import PlannerScreen from './screens/PlannerScreen'
import type { StudentSetupProfile } from './types/studentProfile'
import type { CourseAttempt } from './types/coursePlan'

type AppScreen = 'setup' | 'planner'

function App() {
  const [screen, setScreen] = useState<AppScreen>('setup')
  const [profile, setProfile] = useState<StudentSetupProfile | null>(null)
  const [attempts, setAttempts] = useState<CourseAttempt[]>([])

  const addAttempt = (attempt: CourseAttempt) => {
    setAttempts((prev) => [...prev, attempt])
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
