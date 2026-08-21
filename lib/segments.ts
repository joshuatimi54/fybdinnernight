/**
 * Broadcast audiences.
 *
 * Plain data, kept out of the "use server" file — that boundary may only
 * export async functions, and both the form and the action need this list.
 * The ids must match the CASE arms in broadcast_audience().
 */
export const SEGMENTS = [
  {
    id: "everyone",
    label: "Everyone approved",
    hint: "Every guest the committee has approved.",
  },
  {
    id: "unpaired",
    label: "Still without a date",
    hint: "Approved, but nobody has said yes yet.",
  },
  {
    id: "paired",
    label: "Already paired",
    hint: "Guests who already have a date.",
  },
  {
    id: "seeking_help",
    label: "Asked for help",
    hint: "Turned on “Help me find a date”.",
  },
  {
    id: "unseated",
    label: "Paired but unseated",
    hint: "Confirmed pairs with no table yet.",
  },
  {
    id: "pending",
    label: "Awaiting approval",
    hint: "Submitted a profile you haven’t reviewed.",
  },
  {
    id: "unfinished",
    label: "Never finished signing up",
    hint: "Started a profile and stopped.",
  },
] as const;

export type SegmentId = (typeof SEGMENTS)[number]["id"];

export const SEGMENT_IDS = SEGMENTS.map((s) => s.id) as unknown as [
  SegmentId,
  ...SegmentId[],
];
