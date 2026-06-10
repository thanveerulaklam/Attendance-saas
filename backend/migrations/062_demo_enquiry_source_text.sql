-- Allow longer, free-text lead sources (e.g. "Google Ads", "Chennai trade fair").

ALTER TABLE demo_enquiries
  ALTER COLUMN source TYPE VARCHAR(120);

COMMENT ON COLUMN demo_enquiries.source IS 'Lead origin: landing, referral, event name, campaign, etc.';
