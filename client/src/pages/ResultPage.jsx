import { Container, Row, Col, Card, Button, Alert } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router-dom'

function ResultPage({ gameData, setGameData }) {
  const navigate = useNavigate()
  if (!gameData || !gameData.result) { navigate('/setup'); return null }

  const { result, start, destination } = gameData
  const score = result?.score ?? 0
  const isValid = result?.valid ?? false

  const handlePlayAgain = () => {
    setGameData(null)
    navigate('/setup')
  }

  return (
    <Container className='py-5'>
      <Row className='justify-content-center'>
        <Col md={7}>
          <Card className='shadow text-center'>
            <Card.Header className='bg-dark text-white fs-5'>🏁 Game Over</Card.Header>
            <Card.Body className='py-5'>
              <p className='text-muted mb-1'>{start?.name} → {destination?.name}</p>
              {!isValid && <Alert variant='danger' className='mt-3'>❌ Your route was <strong>invalid or incomplete</strong>. You lose all coins.</Alert>}
              <div style={{ fontSize: '4rem', fontWeight: 800, color: score === 0 ? '#dc3545' : '#198754', marginTop: '1rem' }}>
                🪙 {score}
              </div>
              <div className='text-muted mb-4'>coins</div>
              {score >= 24 && <Alert variant='success'>🎉 Amazing! You gained coins!</Alert>}
              {score === 0 && isValid && <Alert variant='warning'>Events wiped out all your coins!</Alert>}
              <div className='d-flex gap-3 justify-content-center'>
                <Button variant='primary' size='lg' onClick={handlePlayAgain}>🔄 Play Again</Button>
                <Button as={Link} to='/ranking' variant='outline-secondary' size='lg'>🏆 Ranking</Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}

export default ResultPage
