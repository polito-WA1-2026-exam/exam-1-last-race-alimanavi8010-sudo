import { useContext } from 'react'
import { Container, Row, Col, Card, Button, Alert } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import UserContext from '../contexts/UserContext.js'

function HomePage() {
  const user = useContext(UserContext)
  return (
    <Container className='py-5'>
      <Row className='justify-content-center'>
        <Col lg={8}>
          <div className='text-center mb-5'>
            <h1 className='display-4 fw-bold'>🚇 Last Race</h1>
            <p className='lead text-muted'>Navigate the Turin metro, beat the clock, collect coins.</p>
            {user
              ? <Button as={Link} to='/setup' variant='danger' size='lg'>Play Now →</Button>
              : <Button as={Link} to='/login' variant='primary' size='lg'>Login to Play</Button>
            }
          </div>
          <Card className='mb-4 shadow-sm'>
            <Card.Header as='h5'>📖 How to Play</Card.Header>
            <Card.Body>
              <h6>🎯 Goal</h6>
              <p>Start with <strong>20 coins</strong>. You get a random start and destination. Reach it with as many coins as possible.</p>
              <h6 className='mt-3'>🗺️ Phase 1 — Setup</h6>
              <p>Study the full Turin metro map. You have limited time — when the timer expires the game starts automatically.</p>
              <h6 className='mt-3'>🧩 Phase 2 — Planning (90 seconds)</h6>
              <p>Lines are hidden. Use the shuffled segment list to build your route. Click segments to add them.</p>
              <Alert variant='warning' className='py-2'>⚠️ Line changes only allowed at <strong>interchange stations</strong> (marked ⇄). Unreachable segments show a DISCONNECTED warning.</Alert>
              <h6 className='mt-3'>⚡ Phase 3 — Execution</h6>
              <p>Each segment has a random event. After 4 stops, bad events become more likely!</p>
              <h6 className='mt-3'>🏆 Result</h6>
              <p className='mb-0'>Final score = remaining coins (min 0). Your best score appears on the <Link to={user ? '/ranking' : '/login'}>ranking</Link>.</p>
            </Card.Body>
          </Card>
          {!user && <Alert variant='info' className='text-center'><strong>You are browsing as a guest.</strong> Login to access the game.</Alert>}
        </Col>
      </Row>
    </Container>
  )
}

export default HomePage
