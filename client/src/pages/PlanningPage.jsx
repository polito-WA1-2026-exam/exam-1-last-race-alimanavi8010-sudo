import { useState, useEffect, useRef, useCallback } from 'react'
import { Container, Row, Col, Card, Button, Badge, Alert, Spinner } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { getNetwork, getSegments, submitRoute } from '../api/api.js'
import NetworkMap from '../components/NetworkMap.jsx'

const PLANNING_SECONDS = 90

function PlanningPage({ gameData, setGameData }) {
  const navigate = useNavigate()
  if (!gameData) { navigate('/setup'); return null }

  const { start, destination } = gameData
  const [network, setNetwork] = useState([])
  const [segments, setSegments] = useState([])
  const [route, setRoute] = useState([start.id])
  const [timeLeft, setTimeLeft] = useState(PLANNING_SECONDS)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [disconnected, setDisconnected] = useState(false)
  const timerRef = useRef(null)
  const routeRef = useRef(route)
  routeRef.current = route

  const doSubmit = useCallback(async (finalRoute) => {
    if (submitted) return
    setSubmitted(true)
    clearInterval(timerRef.current)
    try {
      const result = await submitRoute(start.id, destination.id, finalRoute)
      setGameData(prev => ({ ...prev, route: finalRoute, result }))
      navigate('/execution')
    } catch (err) {
      setError(err.message)
      setSubmitted(false)
    }
  }, [submitted, start.id, destination.id, setGameData, navigate])

  useEffect(() => {
    Promise.all([getNetwork(), getSegments()])
      .then(([net, segs]) => { setNetwork(net); setSegments(segs) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); doSubmit(routeRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [doSubmit])

  const stationById = {}
  for (const line of network) for (const st of line.stations) stationById[st.id] = st.name

  // Build the set of segments already used in the current route
  // (normalized so direction doesn't matter), once per render.
  const usedSegmentKeys = new Set()
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1]
    usedSegmentKeys.add([Math.min(a, b), Math.max(a, b)].join('-'))
  }
  const isSegmentUsed = (seg) => {
    const key = [Math.min(seg.stationA.id, seg.stationB.id), Math.max(seg.stationA.id, seg.stationB.id)].join('-')
    return usedSegmentKeys.has(key)
  }

  const currentStationId = route[route.length - 1]
  // "Reachable" now means: touches the current station AND hasn't been used yet.
  const reachableSegments = segments.filter(seg =>
    (seg.stationA.id === currentStationId || seg.stationB.id === currentStationId) &&
    !isSegmentUsed(seg)
  )

  const handleSegmentClick = (seg) => {
    if (submitted) return
    if (!reachableSegments.includes(seg)) {
      setDisconnected(true)
      setTimeout(() => setDisconnected(false), 2000)
      return
    }
    setDisconnected(false)
    const nextId = seg.stationA.id === currentStationId ? seg.stationB.id : seg.stationA.id
    setRoute(prev => [...prev, nextId])
  }

  const handleUndo = () => {
    if (route.length <= 1 || submitted) return
    setRoute(prev => prev.slice(0, -1))
    setDisconnected(false)
  }

  const isComplete = route[route.length - 1] === destination.id
  const isTimeLow = timeLeft <= 20
  const highlightIds = new Set([start.id, destination.id])
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(timeLeft % 60).padStart(2, '0')

  if (loading) return <Container className='py-5 text-center'><Spinner animation='border' variant='primary' /></Container>

  return (
    <Container fluid className='py-3 px-4'>
      {error && <Alert variant='danger'>{error}</Alert>}
      {disconnected && <Alert variant='danger' className='text-center fw-bold'>🚫 DISCONNECTED — That segment is not reachable from your current position!</Alert>}

      <Row className='mb-3 align-items-center'>
        <Col>
          <h4 className='mb-0'>🧩 Planning Phase</h4>
          <small className='text-muted'>From: <strong>{start.name}</strong> → To: <strong>{destination.name}</strong></small>
        </Col>
        <Col xs='auto'>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: isTimeLow ? '#dc3545' : '#333' }}>
            ⏱ {mins}:{secs}
          </div>
        </Col>
      </Row>

      <Row>
        <Col md={5}>
          <Card className='mb-3'>
            <Card.Header className='fw-semibold'>Station Map (lines hidden)</Card.Header>
            <Card.Body><NetworkMap network={network} showLines={false} highlightIds={highlightIds} /></Card.Body>
          </Card>
          <Card>
            <Card.Header className='d-flex justify-content-between align-items-center'>
              <span className='fw-semibold'>Your Route</span>
              <Badge bg={isComplete ? 'success' : 'secondary'}>{route.length - 1} stops</Badge>
            </Card.Header>
            <Card.Body style={{ maxHeight: 240, overflowY: 'auto' }}>
              {route.map((stId, idx) => (
                <div key={idx} className='d-flex align-items-center gap-2 py-1 border-bottom'>
                  <span>{idx === 0 ? '🚉' : stId === destination.id ? '🏁' : '📍'}</span>
                  <span style={{ fontSize: '0.9rem' }}>{stationById[stId] || stId}</span>
                </div>
              ))}
            </Card.Body>
            <Card.Footer className='d-flex gap-2'>
              <Button variant='outline-secondary' size='sm' onClick={handleUndo} disabled={route.length <= 1 || submitted}>↩ Undo</Button>
              <Button variant='success' size='sm' className='ms-auto' disabled={!isComplete || submitted} onClick={() => doSubmit(route)}>✅ Submit</Button>
            </Card.Footer>
          </Card>
        </Col>
        <Col md={7}>
          <Card>
            <Card.Header className='fw-semibold'>
              All Segments
              <Badge bg='primary' className='ms-2'>{reachableSegments.length} reachable</Badge>
            </Card.Header>
            <Card.Body style={{ maxHeight: 540, overflowY: 'auto' }}>
              <p className='text-muted small mb-2'><strong>Green = reachable</strong> from current position. Click to add.</p>
              {segments.map((seg, idx) => {
                const isReachable = reachableSegments.includes(seg)
                const alreadyUsed = isSegmentUsed(seg)
                return (
                  <div key={idx} onClick={() => handleSegmentClick(seg)} style={{
                    cursor: submitted ? 'default' : 'pointer',
                    padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                    backgroundColor: alreadyUsed ? '#f8f9fa' : isReachable ? '#d4edda' : 'white',
                    borderLeft: isReachable ? '4px solid #28a745' : '4px solid transparent',
                    opacity: alreadyUsed ? 0.5 : 1,
                    fontWeight: isReachable ? 600 : 400,
                  }}>
                    {seg.stationA.name} — {seg.stationB.name}
                    {alreadyUsed && <Badge bg='light' text='dark' className='ms-2'>✓ used</Badge>}
                  </div>
                )
              })}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}

export default PlanningPage
