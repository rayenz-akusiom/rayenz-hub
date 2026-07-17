import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CardFaceSessionProvider } from '../cards/CardFaceSession';
import { DeckBuilderApp } from './DeckBuilderApp';
import '../cards/cards.css';
import './deck-builder.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CardFaceSessionProvider>
        <DeckBuilderApp />
      </CardFaceSessionProvider>
    </StrictMode>,
  );
}
