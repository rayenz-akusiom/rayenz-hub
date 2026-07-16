import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DailiesApp } from './DailiesApp';
import '../../../../rayenz-hub/shared/hub-progress.css';
import './dailies.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <DailiesApp />
    </StrictMode>,
  );
}
