import { useContext } from 'react'
import { Navbar, Nav, Container, Button } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router-dom'
import UserContext from '../contexts/UserContext.js'
import { doLogout } from '../api/auth.js'

function NavBar({ doLogout: onLogout }) {
  const user = useContext(UserContext)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await doLogout()
    onLogout()
  }

  return (
    <Navbar bg='dark' variant='dark' expand='lg' sticky='top'>
      <Container>
        <Navbar.Brand as={Link} to='/'>🚇 Last Race</Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse>
          <Nav className='me-auto'>
            {user && <>
              <Nav.Link as={Link} to='/setup'>Play</Nav.Link>
              <Nav.Link as={Link} to='/ranking'>Ranking</Nav.Link>
            </>}
          </Nav>
          <Nav>
            {user ? (
              <div className='d-flex align-items-center gap-3'>
                <span className='text-light'>👤 {user.username}</span>
                <Button variant='outline-light' size='sm' onClick={handleLogout}>Logout</Button>
              </div>
            ) : (
              <Nav.Link as={Link} to='/login'>Login</Nav.Link>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}

export default NavBar
