import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const endpoint = process.env.VITE_API_URL;
if (!endpoint) {
  if (process.env.MOBILE_VALIDATE_ONLY === '1')
    console.warn(
      'Validation-only mobile bundle: no online backend configured. Not for distribution.',
    );
  else
    throw Error(
      'Set VITE_API_URL to the approved HTTPS backend before building a mobile app. For compile checks only, set MOBILE_VALIDATE_ONLY=1.',
    );
} else {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' &&
    url.hostname !== 'localhost' &&
    url.hostname !== '127.0.0.1'
  )
    throw Error('Mobile API requires HTTPS.');
}
