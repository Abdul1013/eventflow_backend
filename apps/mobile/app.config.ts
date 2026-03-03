import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'EventFlow Staff',
  slug: 'eventflow-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#4F46E5',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.eventflow.staff',
    infoPlist: {
      NSCameraUsageDescription:
        'EventFlow uses the camera to scan QR codes on event tickets.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
    package: 'com.eventflow.staff',
    permissions: ['android.permission.CAMERA'],
  },
  plugins: ['expo-router', 'expo-camera', 'expo-secure-store', 'expo-sqlite', 'expo-haptics'],
  scheme: 'eventflow',
  extra: {
    // Read from .env at build time; accessed at runtime via Constants.expoConfig.extra.apiBaseUrl
    apiBaseUrl: process.env['API_BASE_URL'] ?? 'http://localhost:3000/api/v1',
  },
});
