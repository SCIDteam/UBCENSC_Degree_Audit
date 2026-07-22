import { GraduationCap } from 'lucide-react'

function App() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-card">
        <GraduationCap className="mb-4 size-8 text-primary" />
        <h1 className="font-heading text-xl font-semibold text-card-foreground">
          Degree Auditor
        </h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Visual theme test shell.
        </p>
        <button
          type="button"
          className="mt-6 rounded-md bg-primary px-4 py-2 font-body text-sm font-medium text-primary-foreground"
        >
          Primary action
        </button>
      </div>
    </div>
  )
}

export default App
