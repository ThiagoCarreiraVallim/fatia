import { LogtoNextConfig } from '@logto/next';

export const logtoConfig: LogtoNextConfig = {
  endpoint: process.env.LOGTO_ENDPOINT ?? 'http://localhost:3002',
  appId: process.env.LOGTO_APP_ID ?? '',
  appSecret: process.env.LOGTO_APP_SECRET ?? '',
  baseUrl: process.env.LOGTO_BASE_URL ?? 'http://localhost:3001',
  cookieSecret:
    process.env.LOGTO_COOKIE_SECRET ?? 'replace_with_32_byte_random_string_for_dev_only',
  cookieSecure: process.env.NODE_ENV === 'production',
  resources: process.env.LOGTO_AUDIENCE ? [process.env.LOGTO_AUDIENCE] : [],
  scopes: ['email', 'profile', 'roles', 'offline_access'],
};
