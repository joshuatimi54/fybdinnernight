import { callCronRoute } from "./_call.mjs";

/**
 * The daily pass: nudges anyone still without a date, and warns people whose
 * invitations are about to lapse.
 *
 * 08:00 UTC is 09:00 in Lagos — late enough that a nudge is not the first
 * thing somebody reads, early enough to act on the same day.
 */
export default async () => callCronRoute("/api/cron/daily");

export const config = {
  schedule: "0 8 * * *",
};
