import { useState } from 'react'
import Home from './pages/Home'
import StudentLive from './pages/StudentLive'
import InstructorLive from './pages/InstructorLive'

export type StudentSession = { code: string; language: string; title: string }
export type InstructorSession = { code: string; password: string; title: string; mode?: 'lecture' | 'personal' }

type View = 'home' | 'student' | 'instructor'

export default function App() {
  const [view, setView] = useState<View>('home')
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [instructor, setInstructor] = useState<InstructorSession | null>(null)

  return (
    <div className="app">
      {view === 'home' && (
        <Home
          onJoinStudent={(s) => { setStudent(s); setView('student') }}
          onCreateInstructor={(s) => { setInstructor(s); setView('instructor') }}
        />
      )}
      {view === 'student' && student && (
        <StudentLive session={student} onLeave={() => setView('home')} />
      )}
      {view === 'instructor' && instructor && (
        <InstructorLive session={instructor} onLeave={() => setView('home')} />
      )}
    </div>
  )
}
