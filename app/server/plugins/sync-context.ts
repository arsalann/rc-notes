import { setWriteContextProvider } from '~/server/utils/db';
import { writeContextFor } from '~/server/utils/syncContext';

/**
 * Hands each request's device metadata to the database layer, which passes it to the sync triggers.
 * Relies on `nitro.experimental.asyncContext` so `useEvent()` works anywhere in a request.
 */
export default defineNitroPlugin(() => {
  setWriteContextProvider(() => {
    const event = useEvent();
    return event ? writeContextFor(event) : null;
  });
});
