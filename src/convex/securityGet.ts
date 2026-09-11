import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/**
 * Returns the authenticated user id for the current request, or null.
 * Used by actions as a single trusted identity source — actions must never
 * accept a user id from the client.
 */
export const userId = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});
