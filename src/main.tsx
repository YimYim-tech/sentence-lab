import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/assistant/hebrew-400.css';
import '@fontsource/assistant/hebrew-600.css';
import '@fontsource/assistant/hebrew-700.css';
import '@fontsource/assistant/hebrew-800.css';
import '@fontsource/assistant/latin-400.css';
import '@fontsource/assistant/latin-600.css';
import '@fontsource/assistant/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/secular-one/hebrew-400.css';
import '@fontsource/secular-one/latin-400.css';
import './styles/app.css';
import { App } from './app/App';

document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
