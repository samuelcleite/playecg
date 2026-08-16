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
    // A cor tem que ser a mesma do drawable/splash.png. Enquanto era #0B0B0F
    // contra um splash claro, a troca entre a janela de launch e o splash do
    // plugin aparecia como um flash.
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#0D1E30' }
  }
};

export default config;