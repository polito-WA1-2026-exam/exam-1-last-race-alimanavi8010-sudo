import { Badge } from 'react-bootstrap'

function NetworkMap({ network, showLines = true, highlightIds = new Set() }) {
  if (!network || network.length === 0) return null

  const stationLineCount = {}
  for (const line of network)
    for (const st of line.stations)
      stationLineCount[st.id] = (stationLineCount[st.id] || 0) + 1

  const isInterchange = (id) => stationLineCount[id] > 1

  if (showLines) {
    return (
      <div className='p-3 bg-white rounded shadow-sm'>
        {network.map(line => (
          <div key={line.id} className='mb-4'>
            <div className='d-flex align-items-center gap-2 mb-2'>
              <div style={{ width: 24, height: 12, borderRadius: 6, backgroundColor: line.color }} />
              <strong style={{ color: line.color }}>{line.name}</strong>
            </div>
            <div className='d-flex align-items-center flex-wrap'>
              {line.stations.map((st, idx) => (
                <div key={st.id} className='d-flex align-items-center'>
                  <div className='d-flex flex-column align-items-center' style={{ minWidth: 80 }}>
                    <div style={{
                      width: isInterchange(st.id) ? 18 : 14,
                      height: isInterchange(st.id) ? 18 : 14,
                      borderRadius: '50%',
                      backgroundColor: line.color,
                      border: '3px solid white',
                      boxShadow: isInterchange(st.id) ? '0 0 0 3px #111' : '0 0 0 2px #555',
                      outline: highlightIds.has(st.id) ? '3px solid gold' : 'none',
                    }} />
                    <small style={{
                      fontSize: '0.72rem', textAlign: 'center', maxWidth: 76,
                      lineHeight: 1.2, marginTop: 4,
                      fontWeight: highlightIds.has(st.id) ? 700 : 400,
                      color: highlightIds.has(st.id) ? '#856404' : '#333',
                    }}>{st.name}</small>
                  </div>
                  {idx < line.stations.length - 1 && (
                    <div style={{ width: 30, height: 4, backgroundColor: line.color, marginBottom: 18 }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className='mt-2 pt-2 border-top d-flex gap-3'>
          <small className='text-muted'>● Regular station</small>
          <small className='text-muted'>⬤ Interchange (change lines here)</small>
        </div>
      </div>
    )
  }

  const allStations = [...new Map(
    network.flatMap(l => l.stations).map(s => [s.id, s])
  ).values()]

  return (
    <div className='p-3 bg-white rounded shadow-sm'>
      <p className='text-muted small mb-3'><em>Lines are hidden. Use the segment list to reconstruct the network.</em></p>
      <div className='d-flex flex-wrap gap-2'>
        {allStations.map(st => (
          <div key={st.id} className='px-2 py-1 d-flex align-items-center gap-1' style={{
            border: highlightIds.has(st.id) ? '2px solid gold' : '1px solid #dee2e6',
            borderRadius: 8,
            backgroundColor: highlightIds.has(st.id) ? '#fff3cd' : 'white',
            fontWeight: highlightIds.has(st.id) ? 700 : 400,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: isInterchange(st.id) ? '#333' : '#999' }} />
            <small>{st.name}</small>
            {isInterchange(st.id) && <Badge bg='secondary' style={{ fontSize: '0.6rem' }}>⇄</Badge>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default NetworkMap
