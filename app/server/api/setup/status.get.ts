import { isConfigured, getUsername } from '~/server/utils/config';

export default defineEventHandler(() => {
  return {
    configured: isConfigured(),
    username: getUsername(),
  };
});
