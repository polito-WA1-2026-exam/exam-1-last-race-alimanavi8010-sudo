import { useState, useEffect, useRef } from 'react'
import { Container, Button, Alert, Spinner, ProgressBar } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { getNetwork, startGame } from '../api/api.js'
import NetworkMap from '../components/NetworkMap.jsx'

const MEMORIZE_SECONDS = 30

function SetupPage({ setGameData }) {
  const [network, setNetwork] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(MEMORIZE_SECONDS)
  const navigate = useNavigate()
  const timerRef = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => {
    getNetwork()
      .then(data => setNetwork(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          if (!startedRef.current) handleStart()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [loading])

  const handleStart = async () => {
    if (startedRef.current) return
    startedRef.current = true
    clearInterval(timerRef.current)
    setStarting(true)
    try {
      const { start, destination } = await startGame()
      setGameData({ start, destination, route: [], result: undefined })
      navigate('/planning')
    } catch (err) {
      setError(err.message)
      startedRef.current = false
      setStarting(false)
    }
  }

  const progress = Math.round((timeLeft / MEMORIZE_SECONDS) * 100)
  const isLow = timeLeft <= 10

  return (
    <Container className='py-4' style={{ maxWidth: 1000 }}>
      <h2 className='mb-1'>🗺️ Setup — Memorise the Network</h2>
      <p className='text-muted mb-3'>Study the Turin metro map. The game starts when the timer expires.</p>
      {error && <Alert variant='danger'>{error}</Alert>}
      {!loading && (
        <div className='mb-4'>
          <div className='d-flex justify-content-between mb-1'>
            <small className='text-muted'>Time to memorise:</small>
            <strong style={{ color: isLow ? '#dc3545' : '#198754', fontSize: '1.2rem' }}>{timeLeft}s</strong>
          </div>
          <ProgressBar now={progress} variant={isLow ? 'danger' : 'success'} animated={!isLow} />
        </div>
      )}
      {loading
        ? <div className='text-center py-5'><Spinner animation='border' variant='primary' /></div>
        : <>
            <NetworkMap network={network} showLines={true} />
            <div className='text-center mt-4'>
              <Button variant='danger' size='lg' onClick={handleStart} disabled={starting}>
                {starting ? <><Spinner size='sm' className='me-2' />Starting…</> : "🚦 I'm Ready!"}
              </Button>
              <p className='text-muted mt-2 small'>Or wait for the timer to expire.</p>
            </div>
          </>
      }
    </Container>
  )
}

export default SetupPage
