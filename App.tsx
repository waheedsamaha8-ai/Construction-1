
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProjectFolder from './pages/ProjectFolder';
import LetterEditor from './pages/LetterEditor';
import GlobalLoadingBar from './components/GlobalLoadingBar';
import { api } from './services/api';

// Protect Route Component with Explicit Typing
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!api.isAuthenticated()) {
    // If not authenticated, force back to Home (Login Screen)
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <GlobalLoadingBar />
      <Routes>
        {/* Dashboard acts as the Gatekeeper. It shows Login if not auth, Content if auth. */}
        <Route path="/" element={<Dashboard />} />
        
        {/* Strictly Protect Deep Links */}
        <Route 
          path="/project/:projectId" 
          element={
            <ProtectedRoute>
              <ProjectFolder />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/project/:projectId/:folderId" 
          element={
            <ProtectedRoute>
              <ProjectFolder />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/archive/:folderId" 
          element={
            <ProtectedRoute>
              <ProjectFolder />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/editor/:projectId/:folderId" 
          element={
            <ProtectedRoute>
              <LetterEditor />
            </ProtectedRoute>
          } 
        />
        
        {/* Force redirect to Home (Login) for any unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
