import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.playecg.app',
  appName: 'PlayECG',
  webDir: 'dist',
  server: {
    url: 'https://playecg.app',
    hostname: 'playecg.app',
    androidScheme: 'https',
    allowNavigation: ['playecg.app', '*.playecg.app', '*.base44.app']
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#0B0B0F' }
  }
};

export default config;