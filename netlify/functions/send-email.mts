import { callCronRoute } from "./_call.mjs";

/** Drains the email outbox. Without this, nothing the site queues ever sends. */
export default async () => callCronRoute("/api/cron/email");

export const config = {
  schedule: "*/5 * * * *",
};
