import 'bootstrap/dist/css/bootstrap.min.css'
import { useState, useEffect, useContext } from 'react'
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import UserContext from './contexts/UserContext.js'
import { checkSession } from './api/auth.js'
import NavBar from './components/NavBar.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SetupPage from './pages/SetupPage.jsx'
import PlanningPage from './pages/PlanningPage.jsx'
import ExecutionPage from './pages/ExecutionPage.jsx'
import ResultPage from './pages/ResultPage.jsx'
import RankingPage from './pages/RankingPage.jsx'

function App() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [gameData, setGameData] = useState(null)

  // Restore session on startup
  useEffect(() => {
    checkSession().then(result => {
      if (result) setUser(result)
    })
  }, [])

  const doLogin = (loggedUser) => {
    setUser(loggedUser)
    navigate('/')
  }

  const doLogout = () => {
    setUser(null)
    navigate('/')
  }

  return (
    <UserContext.Provider value={user}>
      <Routes>
        <Route path='/' element={<MainLayout doLogout={doLogout} />}>
          <Route index element={<HomePage />} />
          <Route path='login' element={<LoginPage doLogin={doLogin} />} />
          <Route path='setup' element={<ProtectedRoute><SetupPage setGameData={setGameData} /></ProtectedRoute>} />
          <Route path='planning' element={<ProtectedRoute><PlanningPage gameData={gameData} setGameData={setGameData} /></ProtectedRoute>} />
          <Route path='execution' element={<ProtectedRoute><ExecutionPage gameData={gameData} setGameData={setGameData} /></ProtectedRoute>} />
          <Route path='result' element={<ProtectedRoute><ResultPage gameData={gameData} setGameData={setGameData} /></ProtectedRoute>} />
          <Route path='ranking' element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
          <Route path='*' element={<Navigate to='/' replace />} />
        </Route>
      </Routes>
    </UserContext.Provider>
  )
}

function MainLayout({ doLogout }) {
  return (
    <>
      <NavBar doLogout={doLogout} />
      <Outlet />
    </>
  )
}

function ProtectedRoute({ children }) {
  const user = useContext(UserContext)
  if (!user) return <Navigate to='/login' replace />
  return children
}

export default App
