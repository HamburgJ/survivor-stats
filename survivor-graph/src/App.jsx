import SurvivorGraph from './components/SurvivorGraph'

function App() {
  return (
    <div style={{ 
      margin: 0, 
      padding: 0, 
      width: '100vw', 
      height: '100vh', 
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      <SurvivorGraph />
    </div>
  )
}

export default App
