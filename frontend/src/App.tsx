import { useState } from 'react'
import SetupScreen from './screens/SetupScreen'
import PlannerScreen from './screens/PlannerScreen'
import type { StudentSetupProfile } from './types/studentProfile'

type AppScreen = 'setup' | 'planner'

function App() {
  const [screen, setScreen] = useState<AppScreen>('setup')
  const [profile, setProfile] = useState<StudentSetupProfile | null>(null)

  if (screen === 'planner' && profile) {
    return <PlannerScreen profile={profile} onBack={() => setScreen('setup')} />
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
