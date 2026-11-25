import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { App } from './App';
import { NativeLaunch } from '@/components/layout/NativeLaunch';
import { AppProviders } from '@/providers/AppProviders';
import { trackNativeViewport } from '@/utils/nativeViewport';

const isNativeApp = Capacitor.isNativePlatform();
document.documentElement.classList.toggle('native-app', isNativeApp);
if (isNativeApp) trackNativeViewport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NativeLaunch enabled={isNativeApp}>
      <BrowserRouter>
        <AppProviders>
          <App />
        </AppProviders>
      </BrowserRouter>
    </NativeLaunch>
  </StrictMode>,
);
