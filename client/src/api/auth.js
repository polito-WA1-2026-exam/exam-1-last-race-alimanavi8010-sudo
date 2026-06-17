const SERVER = 'http://localhost:3001'

async function doLogin(username, password) {
  const response = await fetch(`${SERVER}/api/sessions`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  if (response.ok) return await response.json()
  else throw new Error('Incorrect username or password.')
}

async function doLogout() {
  await fetch(`${SERVER}/api/sessions/current`, { method: 'DELETE', credentials: 'include' })
}

async function checkSession() {
  const response = await fetch(`${SERVER}/api/sessions/current`, { credentials: 'include' })
  if (response.ok) return await response.json()
  else return null
}

export { doLogin, doLogout, checkSession }
