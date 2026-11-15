import type { ExpoConfig } from 'expo/config';

const BLE_REASON =
  'M010 Barrier uses Bluetooth to talk directly to your parking barrier. No internet connection is used.';

// Constraint 5 (100% local): release builds declare no network permission at all.
// Development builds keep INTERNET so the dev client can reach Metro.
const isDevBuild =
  process.env.EAS_BUILD_PROFILE === 'development' || process.env.APP_VARIANT === 'development';

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
    // BLE permissions are owned by the react-native-ble-plx plugin (BLUETOOTH_SCAN neverForLocation,
    // FINE/COARSE location capped at maxSdk 30). Declaring them here too can drop those flags.
    permissions: [],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      ...(isDevBuild ? [] : ['android.permission.INTERNET']),
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
        isBackgroundEnabled: false, // foreground only; see STACK.md
        neverForLocation: true,
        bluetoothAlwaysPermission: BLE_REASON,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
};

export default config;
