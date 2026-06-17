const SERVER = 'http://localhost:3001'

async function getNetwork() {
  const response = await fetch(`${SERVER}/api/network`, { credentials: 'include' })
  if (response.ok) return await response.json()
  else throw new Error('Failed to load network.')
}

async function getSegments() {
  const response = await fetch(`${SERVER}/api/segments`, { credentials: 'include' })
  if (response.ok) return await response.json()
  else throw new Error('Failed to load segments.')
}

async function startGame() {
  const response = await fetch(`${SERVER}/api/game/start`, { credentials: 'include' })
  if (response.ok) return await response.json()
  else throw new Error('Failed to start game.')
}

async function submitRoute(startId, destinationId, route) {
  const response = await fetch(`${SERVER}/api/game/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ startId, destinationId, route }),
  })
  if (response.ok) return await response.json()
  else throw new Error('Failed to submit route.')
}

async function getRanking() {
  const response = await fetch(`${SERVER}/api/ranking`, { credentials: 'include' })
  if (response.ok) return await response.json()
  else throw new Error('Failed to load ranking.')
}

export { getNetwork, getSegments, startGame, submitRoute, getRanking }
