-- ===========================================================================
-- FYB Dinner Night — the actual event
-- ===========================================================================
-- Saturday 29 August 2026, 3:00pm (WAT, UTC+1).
--
-- The runway is eight days, and that changes the invitation timings. The
-- 48-hour expiry was sized for a four-week campaign: on an eight-day one, a
-- single person burning their five invitations back to back would need ten
-- days just to wait them out — longer than the event itself.
--
-- So expiry drops to 24 hours. Everything here is editable from
-- /admin/settings without a deploy; these are only the starting values.
-- ===========================================================================

update event_config set
  event_name       = 'FYB Dinner Night',
  event_starts_at  = timestamptz '2026-08-29 15:00+01',
  venue            = 'CACCF Auditorium, Behind Adejuyigbe Shopping Complex, Peace Avenue FUTA SouthGate, Akure',
  dress_code       = 'Come as your best self',

  -- Two days before the night, so the committee has a full day to finish
  -- pairing from the matchmaker queue and print table cards.
  pairing_deadline = timestamptz '2026-08-28 18:00+01',

  -- Halved for the compressed runway. Five invitations at 24 hours is five
  -- days of waiting worst case, which still fits inside the window.
  invite_expiry_hours = 24
where id;
