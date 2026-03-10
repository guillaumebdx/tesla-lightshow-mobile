import { Platform } from 'react-native';

// Backend API URL
// Android emulator uses 10.0.2.2 to reach host machine's localhost
// In production, replace with your VPS domain
const DEV_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001'
  : 'http://localhost:3001';

const PROD_URL = 'https://lightstudio.harari.ovh';

export const API_BASE_URL = __DEV__ ? DEV_URL : PROD_URL;
