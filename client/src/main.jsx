import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { I18nProvider } from './i18n.jsx';
import { VaultCryptoProvider } from './crypto/VaultCryptoContext.jsx';
import { registerServiceWorker } from './pwa.js';
import { initAnalytics, track } from './analytics.js';
import { captureEmailClickAttribution } from './emailClick.js';
import './styles.css';

registerServiceWorker();
initAnalytics();
captureEmailClickAttribution();
track('app_boot');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <VaultCryptoProvider>
            <App />
          </VaultCryptoProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
