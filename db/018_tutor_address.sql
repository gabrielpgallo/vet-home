-- Keep existing free-text addresses intact; structure only on explicit editing.
ALTER TABLE tutors ADD COLUMN address_details jsonb;
ALTER TABLE tutors ADD CONSTRAINT tutors_address_details_object CHECK (
  address_details IS NULL OR (
    jsonb_typeof(address_details) = 'object'
    AND address_details->>'postalCode' ~ '^(|[0-9]{8})$'
  )
);
DROP TRIGGER clinic_change ON tutors;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON tutors
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,name,phone,email,address,document,address_details');
