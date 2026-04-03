import { queryAll } from '~/server/utils/db';

export default defineEventHandler(async () => {
  return await queryAll('SELECT * FROM workspaces ORDER BY position ASC');
});
