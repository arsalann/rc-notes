import { isConfigured, getUsername, getUserId } from '~/server/utils/config';

export default defineEventHandler(() => {
  return {
    configured: isConfigured(),
    username: getUsername(),
    user_id: getUserId(),
  };
});
