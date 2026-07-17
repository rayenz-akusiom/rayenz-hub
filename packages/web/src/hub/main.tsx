import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CardFaceSessionProvider } from '../cards/CardFaceSession';
import { HubShell } from './HubShell';
import { installHubGlobals } from './install-hub-globals';
import { redirectLegacyAppsPath } from './routes';
import '../../../../rayenz-hub/shared/shell.css';
import '../../../../rayenz-hub/shared/card-picker.css';
import '../../../../rayenz-hub/shared/deck-chip.css';
import '../../../../rayenz-hub/shared/hub-progress.css';
import '../../../../rayenz-hub/shared/hub-app-chrome.css';
import '../cards/cards.css';
import '../styles.css';
import '../dailies/dailies.css';
import '../deck-builder/deck-builder.css';

function boot() {
  if (redirectLegacyAppsPath()) return;
  installHubGlobals();
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <CardFaceSessionProvider>
          <HubShell />
        </CardFaceSessionProvider>
      </StrictMode>,
    );
  }
}

boot();
