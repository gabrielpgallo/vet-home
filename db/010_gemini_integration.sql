CREATE TABLE clinic_ai_settings (
  organization_id text PRIMARY KEY REFERENCES organizations(id),
  encrypted_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  lease_id uuid,
  lease_until timestamptz
);
ALTER TABLE clinic_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_scope ON clinic_ai_settings
  USING (organization_id = current_setting('app.current_org', true))
  WITH CHECK (organization_id = current_setting('app.current_org', true));
