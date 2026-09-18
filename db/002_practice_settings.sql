CREATE TABLE practice_settings (
 organization_id text PRIMARY KEY REFERENCES organizations(id),
 company_name text NOT NULL CHECK(length(company_name) BETWEEN 1 AND 150),
 veterinarian_name text NOT NULL CHECK(length(veterinarian_name) BETWEEN 1 AND 120),
 crmv text NOT NULL CHECK(length(crmv) BETWEEN 1 AND 60),
 logo bytea, revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(logo IS NULL OR octet_length(logo)<=2097152)
);
ALTER TABLE practice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_scope ON practice_settings
 USING (organization_id = current_setting('app.current_org',true))
 WITH CHECK (organization_id = current_setting('app.current_org',true));
INSERT INTO practice_settings(organization_id,company_name,veterinarian_name,crmv)
 SELECT id,'IR Saúde Animal','Isabelli Ricordi','CRMV-SP 53.181' FROM organizations WHERE id='ar-saude-animal';
UPDATE organizations SET name='IR Saúde Animal' WHERE id='ar-saude-animal';
