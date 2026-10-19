import { queryAll } from '~/server/utils/db';
import { listTags } from '~/server/utils/tags';

/**
 * `GET /api/tags` — every tag: the built-in catalog plus each custom tag stored on a task or note,
 * with its Settings overrides (label, emoji, archived) and how many tasks/notes carry it.
 */
export default defineEventHandler(async () => listTags(queryAll));
