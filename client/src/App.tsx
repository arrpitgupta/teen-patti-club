import { Navigate, Route, Routes } from 'react-router-dom';
import { Toasts } from './components/ui/Toasts';
import CreateGame from './pages/CreateGame';
import GamePage from './pages/GamePage';
import GroupPage from './pages/GroupPage';
import GroupsPage from './pages/GroupsPage';
import HistoryPage from './pages/HistoryPage';
import Home from './pages/Home';
import JoinGame from './pages/JoinGame';
import LearnPage, { GlossaryPage } from './pages/LearnPage';
import PracticePage from './pages/PracticePage';
import PublicResults from './pages/PublicResults';
import TutorialPage from './pages/TutorialPage';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateGame />} />
        <Route path="/join" element={<JoinGame />} />
        <Route path="/join/:code" element={<JoinGame />} />
        <Route path="/g/:code" element={<GamePage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/tutorial" element={<TutorialPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/learn/glossary" element={<GlossaryPage />} />
        <Route path="/r/:id" element={<PublicResults />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/group/:id" element={<GroupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
