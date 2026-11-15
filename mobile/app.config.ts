import type { ExpoConfig } from 'expo/config';

const BLE_REASON =
  'M010 Barrier uses Bluetooth to talk directly to your parking barrier. No internet connection is used.';

const config: ExpoConfig = {
  name: 'M010 Barrier',
  slug: 'm010-barrier',
  scheme: 'm010barrier',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'sa.edu.kfupm.m010.barrier',
    supportsTablet: false,
    infoPlist: {
      NSBluetoothAlwaysUsageDescription: BLE_REASON,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'sa.edu.kfupm.m010.barrier',
    adaptiveIcon: {
      backgroundColor: '#0B0D10',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sharing',
    'expo-font',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F2F2F7',
        dark: { backgroundColor: '#000000' },
        image: './assets/icon.png',
        imageWidth: 120,
      },
    ],
    [
      'react-native-ble-plx',
      {
        isBackgroundEnabled: false,
        neverForLocation: true,
        bluetoothAlwaysPermission: BLE_REASON,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
};

export default config;
