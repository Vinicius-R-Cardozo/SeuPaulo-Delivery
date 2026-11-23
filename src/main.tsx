import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { App } from './App';
import { AppProviders } from '@/providers/AppProviders';

document.documentElement.classList.toggle('native-app', Capacitor.isNativePlatform());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
