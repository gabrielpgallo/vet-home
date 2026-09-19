ALTER TABLE iam_memberships ADD COLUMN is_veterinarian boolean NOT NULL DEFAULT false;
UPDATE iam_memberships SET is_veterinarian=true WHERE role='veterinarian';
CREATE TABLE professional_profiles (
 organization_id text NOT NULL REFERENCES organizations(id),
 user_id text NOT NULL,
 veterinarian_name text NOT NULL,
 veterinarian_title text NOT NULL CHECK(veterinarian_title IN ('Dra.','Dr.')),
 crmv text NOT NULL,
 sipeagro text NOT NULL DEFAULT '',
 veterinarian_cpf text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 PRIMARY KEY(organization_id,user_id)
);
ALTER TABLE professional_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_scope ON professional_profiles
 USING(organization_id=current_setting('app.current_org',true))
 WITH CHECK(organization_id=current_setting('app.current_org',true));
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON professional_profiles
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('organization_id,user_id,veterinarian_name,veterinarian_title,crmv,sipeagro,veterinarian_cpf');
ALTER TABLE prescriptions ADD COLUMN prescriber_id text;
ALTER TABLE prescriptions ADD COLUMN prescriber jsonb;
-- Freeze the historical document identity, without guessing the author's user.
UPDATE prescriptions r SET prescriber=jsonb_build_object(
 'veterinarianName',s.veterinarian_name,'veterinarianTitle',s.veterinarian_title,
 'crmv',s.crmv,'sipeagro',s.sipeagro,'veterinarianCpf',s.veterinarian_cpf)
FROM practice_settings s WHERE s.organization_id=r.organization_id;
CREATE FUNCTION protect_prescription_author() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.prescriber_id IS DISTINCT FROM OLD.prescriber_id OR NEW.prescriber IS DISTINCT FROM OLD.prescriber THEN
  RAISE EXCEPTION 'Prescription authorship is immutable; issue a new prescription';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_prescription_author BEFORE UPDATE ON prescriptions
 FOR EACH ROW EXECUTE FUNCTION protect_prescription_author();
