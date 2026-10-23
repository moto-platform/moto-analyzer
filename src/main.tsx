import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted Iosevka (the analyzer runs offline in the workshop): 400, 600, 400 italic only.
import '@fontsource/iosevka/400.css';
import '@fontsource/iosevka/600.css';
import '@fontsource/iosevka/400-italic.css';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
