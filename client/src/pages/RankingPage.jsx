import { useState, useEffect, useContext } from 'react'
import { Container, Table, Spinner, Alert, Badge } from 'react-bootstrap'
import { getRanking } from '../api/api.js'
import UserContext from '../contexts/UserContext.js'

function RankingPage() {
  const user = useContext(UserContext)
  const [ranking, setRanking] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getRanking()
      .then(data => setRanking(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <Container className='py-4' style={{ maxWidth: 700 }}>
      <h2 className='mb-1'>🏆 Global Ranking</h2>
      <p className='text-muted mb-4'>Best score per player across all games.</p>
      {error && <Alert variant='danger'>{error}</Alert>}
      {loading
        ? <div className='text-center py-5'><Spinner animation='border' variant='primary' /></div>
        : ranking.length === 0
          ? <Alert variant='info'>No games played yet. Be the first!</Alert>
          : <Table striped bordered hover responsive>
              <thead className='table-dark'>
                <tr><th style={{ width: 60 }}>Rank</th><th>Player</th><th>Best Score</th><th>Games</th></tr>
              </thead>
              <tbody>
                {ranking.map((row, idx) => (
                  <tr key={row.username} style={{ backgroundColor: row.username === user?.username ? '#fff3cd' : '', fontWeight: row.username === user?.username ? 600 : 400 }}>
                    <td className='text-center fs-5'>{medals[idx] || `#${idx + 1}`}</td>
                    <td>{row.username}{row.username === user?.username && <Badge bg='info' className='ms-2'>You</Badge>}</td>
                    <td><strong>🪙 {row.best_score}</strong></td>
                    <td className='text-muted'>{row.games_played}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
      }
    </Container>
  )
}

export default RankingPage
