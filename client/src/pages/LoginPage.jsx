import { useState, useContext } from 'react'
import { Container, Row, Col, Card, Form, Button, Alert } from 'react-bootstrap'
import { Navigate } from 'react-router-dom'
import { doLogin } from '../api/auth.js'
import UserContext from '../contexts/UserContext.js'

function LoginPage({ doLogin: onLogin }) {
  const user = useContext(UserContext)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to='/' replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) { setError('Please enter both fields.'); return }
    setLoading(true)
    try {
      const loggedUser = await doLogin(username.trim(), password)
      onLogin(loggedUser)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className='py-5'>
      <Row className='justify-content-center'>
        <Col md={5}>
          <Card className='shadow-sm'>
            <Card.Header as='h5' className='bg-dark text-white'>🔐 Login</Card.Header>
            <Card.Body className='p-4'>
              {error && <Alert variant='danger'>{error}</Alert>}
              <Form onSubmit={handleSubmit}>
                <Form.Group className='mb-3'>
                  <Form.Label>Username</Form.Label>
                  <Form.Control type='text' value={username} onChange={e => setUsername(e.target.value)} disabled={loading} autoFocus />
                </Form.Group>
                <Form.Group className='mb-4'>
                  <Form.Label>Password</Form.Label>
                  <Form.Control type='password' value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
                </Form.Group>
                <Button type='submit' variant='primary' className='w-100' disabled={loading}>
                  {loading ? 'Logging in…' : 'Login'}
                </Button>
              </Form>
              <hr />
              <small className='text-muted'>Demo: <code>alice / alice123</code> · <code>bob / bob123</code> · <code>carol / carol123</code></small>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}

export default LoginPage
