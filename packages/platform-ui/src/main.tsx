import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initConfigViewsRegistry } from './configViews.init';
import { TooltipProvider } from '@agyn/ui';
import { BrowserRouter } from 'react-router-dom';
import { UserProvider } from './user/UserProvider';
import { graphSocket } from './lib/graph/socket';

// Initialize and start graph socket on app bootstrap (runtime only)
graphSocket.init();
graphSocket.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {initConfigViewsRegistry()}
    <TooltipProvider>
      <BrowserRouter>
        <UserProvider>
          <App />
        </UserProvider>
      </BrowserRouter>
    </TooltipProvider>
  </StrictMode>,
)
