import { useState } from 'react'
import Home from './pages/Home'
import StudentLive from './pages/StudentLive'
import InstructorLive from './pages/InstructorLive'
import Maintenance from './pages/Maintenance'

export type StudentSession = { code: string; language: string; title: string }
export type InstructorSession = { code: string; password: string; title: string; mode?: 'lecture' | 'personal' }

type View = 'home' | 'student' | 'instructor'

// 임시로 앱 접근을 막을 때 Vercel 환경변수 VITE_MAINTENANCE_MODE=1 로 설정 후 재배포(빌드 타임 값이라 재배포 필요).
const MAINTENANCE_MODE = import.meta.env.VITE_MAINTENANCE_MODE === '1'

export default function App() {
  const [view, setView] = useState<View>('home')
  const [student, setStudent] = useState<StudentSession | null>(null)
  const [instructor, setInstructor] = useState<InstructorSession | null>(null)

  if (MAINTENANCE_MODE) return <Maintenance />

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
