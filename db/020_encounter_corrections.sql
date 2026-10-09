-- Reasons and request IDs are supplied by the server inside the mutation transaction.
ALTER TABLE change_log ADD COLUMN reason text DEFAULT NULLIF(current_setting('app.change_reason',true),'');
ALTER TABLE change_log ADD COLUMN request_id text DEFAULT NULLIF(current_setting('app.request_id',true),'');
ALTER TABLE visits ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE consultations ADD COLUMN corrected_at timestamptz;
ALTER TABLE consultations ADD COLUMN corrected_by text;
ALTER TABLE applications ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','voided'));
ALTER TABLE payments ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','voided'));
ALTER TABLE payments ADD COLUMN replaces_id uuid;
ALTER TABLE payments ADD COLUMN paid_on date;
UPDATE payments SET paid_on=(created_at AT TIME ZONE 'America/Sao_Paulo')::date;
ALTER TABLE payments ALTER COLUMN paid_on SET NOT NULL;
ALTER TABLE payments ALTER COLUMN paid_on SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);
ALTER TABLE payments ADD CONSTRAINT payments_org_id_unique UNIQUE(organization_id,id);
ALTER TABLE payments ADD CONSTRAINT payment_replacement_scope FOREIGN KEY(organization_id,replaces_id) REFERENCES payments(organization_id,id);
CREATE UNIQUE INDEX payment_one_replacement ON payments(replaces_id) WHERE replaces_id IS NOT NULL;
ALTER TABLE prescriptions ADD COLUMN replaces_id uuid;
ALTER TABLE prescriptions ADD COLUMN record_status text NOT NULL DEFAULT 'active' CHECK(record_status IN ('active','replaced','voided'));
ALTER TABLE prescriptions ADD COLUMN issued_pdf bytea;
ALTER TABLE prescriptions ADD CONSTRAINT prescription_replacement_scope FOREIGN KEY(organization_id,replaces_id) REFERENCES prescriptions(organization_id,id);
CREATE UNIQUE INDEX prescription_one_replacement ON prescriptions(replaces_id) WHERE replaces_id IS NOT NULL;
ALTER TABLE exams ADD COLUMN replaces_id uuid;
ALTER TABLE exams ADD COLUMN record_status text NOT NULL DEFAULT 'active' CHECK(record_status IN ('active','replaced','voided'));
ALTER TABLE exams ADD COLUMN issued_pdf bytea;
ALTER TABLE exams ADD CONSTRAINT exam_replacement_scope FOREIGN KEY(organization_id,replaces_id) REFERENCES exams(organization_id,id);
CREATE UNIQUE INDEX exam_one_replacement ON exams(replaces_id) WHERE replaces_id IS NOT NULL;
-- PDFs already issued are snapshots, excluded from both bootstrap and audit JSON.
CREATE FUNCTION protect_issued_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='vet_app' AND OLD.issued_pdf IS NOT NULL AND
    (TG_OP='DELETE' OR (to_jsonb(NEW)-'record_status') IS DISTINCT FROM (to_jsonb(OLD)-'record_status')) THEN
  RAISE EXCEPTION 'Issued documents are immutable; create a replacement';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_issued_document BEFORE UPDATE OR DELETE ON prescriptions FOR EACH ROW EXECUTE FUNCTION protect_issued_document();
CREATE TRIGGER immutable_issued_document BEFORE UPDATE OR DELETE ON exams FOR EACH ROW EXECUTE FUNCTION protect_issued_document();
DROP TRIGGER clinic_change ON visits;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON visits FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,tutor_id,starts_at,duration_minutes,address,base_cents,status,origin,performed_on');
DROP TRIGGER clinic_change ON consultations;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON consultations FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,visit_id,patient_id,notes,vitals,status,occurred_on,occurred_time');
DROP TRIGGER clinic_change ON applications;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON applications FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,consultation_id,product_id,product_name,unit,quantity_milli,unit_cost_cents,unit_sale_cents,total_cents,batch,route,status');
DROP TRIGGER clinic_change ON payments;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,visit_id,amount_cents,method,paid_on,status,replaces_id');
DROP TRIGGER clinic_change ON prescriptions;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON prescriptions FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,consultation_id,items,instructions,status,prescriber_id,prescriber,record_status,replaces_id');
DROP TRIGGER clinic_change ON exams;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON exams FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,patient_id,consultation_id,request_id,kind,name,mode,partner,notes,attachment_id,occurred_on,record_status,replaces_id');

CREATE FUNCTION protect_signed_prescription_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='vet_app' AND EXISTS(SELECT 1 FROM prescription_signatures WHERE prescription_id=OLD.id AND signed_at IS NOT NULL) AND
 (TG_OP='DELETE' OR (to_jsonb(NEW)-'record_status') IS DISTINCT FROM (to_jsonb(OLD)-'record_status')) THEN
  RAISE EXCEPTION 'Signed prescription content is immutable; create a replacement';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_signed_content BEFORE UPDATE OR DELETE ON prescriptions FOR EACH ROW EXECUTE FUNCTION protect_signed_prescription_content();
