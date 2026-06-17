import { useState, useEffect } from 'react'
import { Container, Card, Button, Badge, ProgressBar, Alert } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'

function ExecutionPage({ gameData, setGameData }) {
  const navigate = useNavigate()
  if (!gameData || !gameData.result) { navigate('/setup'); return null }

  const { result, start, destination } = gameData
  const [stepIndex, setStepIndex] = useState(0)
  const [visibleSteps, setVisibleSteps] = useState([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!result.valid) { navigate('/result'); return }
  }, [result, navigate])

  useEffect(() => {
    if (!result.valid || done) return
    if (stepIndex >= result.steps.length) { setDone(true); return }
    const t = setTimeout(() => {
      setVisibleSteps(prev => [...prev, result.steps[stepIndex]])
      setStepIndex(prev => prev + 1)
    }, stepIndex === 0 ? 400 : 1500)
    return () => clearTimeout(t)
  }, [stepIndex, result, done])

  if (!result.valid) return null

  const currentCoins = visibleSteps.length > 0 ? visibleSteps[visibleSteps.length - 1].coinsAfter : 20
  const progress = result.steps.length > 0 ? Math.round((visibleSteps.length / result.steps.length) * 100) : 100

  return (
    <Container className='py-4' style={{ maxWidth: 800 }}>
      <h2 className='mb-1'>⚡ Execution</h2>
      <p className='text-muted mb-3'>{start.name} → {destination.name}</p>
      <Card className='mb-4 text-center border-primary'>
        <Card.Body className='py-3'>
          <div className='text-muted small'>Current Coins</div>
          <div style={{ fontSize: '3.5rem', fontWeight: 800, color: currentCoins >= 15 ? '#198754' : currentCoins >= 8 ? '#fd7e14' : '#dc3545' }}>
            🪙 {currentCoins}
          </div>
        </Card.Body>
      </Card>
      <ProgressBar now={progress} label={`${visibleSteps.length}/${result.steps.length}`} className='mb-4' variant='info' animated={!done} />
      <div style={{ maxHeight: 400, overflowY: 'auto' }} className='mb-4'>
        {visibleSteps.map((step, idx) => {
          const isPositive = step.event.effect > 0
          const isNegative = step.event.effect < 0
          return (
            <Card key={idx} className='mb-2' style={{ borderLeft: `5px solid ${isPositive ? '#198754' : isNegative ? '#dc3545' : '#6c757d'}`, animation: 'slideIn 0.4s ease' }}>
              <Card.Body className='py-2 px-3'>
                <div className='d-flex justify-content-between align-items-start'>
                  <div>
                    <strong>{step.from}</strong><span className='text-muted mx-2'>→</span><strong>{step.to}</strong>
                    <div className='text-muted small mt-1'>{step.event.description}</div>
                  </div>
                  <Badge bg={isPositive ? 'success' : isNegative ? 'danger' : 'secondary'} style={{ fontSize: '1rem', minWidth: 48, textAlign: 'center' }}>
                    {isPositive ? '+' : ''}{step.event.effect}
                  </Badge>
                </div>
              </Card.Body>
            </Card>
          )
        })}
      </div>
      {done && <>
        <Alert variant={result.score > 0 ? 'success' : 'danger'} className='text-center'>
          <strong>Journey complete!</strong> Final score: <strong>{result.score} coins</strong>
        </Alert>
        <div className='text-center'>
          <Button variant='primary' size='lg' onClick={() => navigate('/result')}>See Result →</Button>
        </div>
      </>}
    </Container>
  )
}

export default ExecutionPage
