import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.seupaulo.delivery',
  appName: 'Seu Paulo Delivery',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
