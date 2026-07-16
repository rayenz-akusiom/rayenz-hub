import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DeckBuilderApp } from './DeckBuilderApp';
import './deck-builder.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <DeckBuilderApp />
    </StrictMode>,
  );
}
