import { Navigate, Route, Routes } from 'react-router-dom';
import { Toasts } from './components/ui/Toasts';
import CreateGame from './pages/CreateGame';
import GamePage from './pages/GamePage';
import Home from './pages/Home';
import JoinGame from './pages/JoinGame';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/join/:code" element={<JoinGame />} />
        <Route path="/g/:code" element={<GamePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
