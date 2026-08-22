import { callCronRoute } from "./_call.mjs";

/**
 * Releases invitations nobody answered, and refunds the sender's budget.
 * Without it, one unanswered invitation locks a person's only outstanding
 * slot for the rest of the event.
 */
export default async () => callCronRoute("/api/cron/expire-invitations");

export const config = {
  schedule: "*/15 * * * *",
};
