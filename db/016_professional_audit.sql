ALTER TABLE professional_profiles ADD COLUMN id text GENERATED ALWAYS AS (user_id) STORED;
DROP TRIGGER clinic_change ON professional_profiles;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON professional_profiles
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,user_id,veterinarian_name,veterinarian_title,crmv,sipeagro,veterinarian_cpf');
DROP TRIGGER clinic_change ON prescriptions;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON prescriptions
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,consultation_id,items,instructions,prescriber_id');
