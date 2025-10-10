import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TracesListPage } from './pages/TracesListPage';
import { TracePage } from './pages/TracePage';
import { ThreadPage } from './pages/ThreadPage';
import { ErrorsByToolPage } from './pages/ErrorsByToolPage';
import { ToolErrorsPage } from './pages/ToolErrorsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TracesListPage />} />
  <Route path="/trace/:traceId" element={<TracePage />} />
  <Route path="/thread/:threadId" element={<ThreadPage />} />
  <Route path="/errors/tools" element={<ErrorsByToolPage />} />
  <Route path="/errors/tools/:label" element={<ToolErrorsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
