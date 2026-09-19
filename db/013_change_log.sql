-- Detailed, append-only application audit. Existing records are not backfilled.
CREATE TABLE change_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id text NOT NULL,
 actor text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
 before_data jsonb,
 after_data jsonb,
 changed_fields text[] NOT NULL
);
CREATE INDEX change_log_org_id ON change_log(organization_id,id DESC);
CREATE INDEX change_log_org_date ON change_log(organization_id,created_at DESC);
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_scope ON change_log FOR SELECT
 USING (organization_id=current_setting('app.current_org',true));
REVOKE ALL ON change_log FROM PUBLIC;

-- Only the explicitly listed columns are serialized. Binary files, credentials,
-- sessions, AI input and internal counters never enter the audit snapshots.
CREATE FUNCTION capture_clinic_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 previous jsonb; following jsonb; snapshot jsonb;
 fields text[]; expression text; org text; entity text; actor_id text;
BEGIN
 IF TG_TABLE_NAME='timeline' THEN
  IF COALESCE(NEW.type,OLD.type)<>'note' THEN RETURN NULL; END IF;
 END IF;
 SELECT string_agg(format('%L,($1).%I',column_name,column_name),',')
 INTO expression FROM unnest(string_to_array(TG_ARGV[0],',')) AS column_name;
 IF TG_OP<>'INSERT' THEN
  EXECUTE 'SELECT jsonb_build_object('||expression||')' INTO previous USING OLD;
 END IF;
 IF TG_OP<>'DELETE' THEN
  EXECUTE 'SELECT jsonb_build_object('||expression||')' INTO following USING NEW;
 END IF;
 IF previous IS NOT DISTINCT FROM following THEN RETURN NULL; END IF;
 snapshot:=COALESCE(following,previous);
 org:=snapshot->>'organization_id';
 IF TG_OP='UPDATE' AND previous->>'organization_id' IS DISTINCT FROM org THEN
  RAISE EXCEPTION 'Moving audited records between clinics is not allowed';
 END IF;
 entity:=COALESCE(snapshot->>'id',
   CASE WHEN TG_TABLE_NAME='visit_patients' THEN (snapshot->>'visit_id')||':'||(snapshot->>'patient_id')
        WHEN TG_TABLE_NAME='exam_links' THEN (snapshot->>'exam_id')||':'||(snapshot->>'consultation_id') END,
   org);
 previous:=previous-'organization_id'-'id';
 following:=following-'organization_id'-'id';
 SELECT array_agg(key ORDER BY key) INTO fields
 FROM jsonb_object_keys(COALESCE(previous,'{}')||COALESCE(following,'{}')) AS key
 WHERE previous->key IS DISTINCT FROM following->key;
 IF fields IS NULL THEN RETURN NULL; END IF;
 actor_id:=COALESCE(NULLIF(current_setting('app.actor_id',true),''),'system');
 INSERT INTO public.change_log(organization_id,actor_id,actor,entity_type,entity_id,operation,before_data,after_data,changed_fields)
 VALUES(org,actor_id,COALESCE((SELECT email FROM public.auth_user WHERE id=actor_id),actor_id),
 TG_TABLE_NAME,entity,TG_OP,previous,following,fields);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION capture_clinic_change() FROM PUBLIC;
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON tutors
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,name,phone,email,address,document');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON patients
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,tutor_id,name,species,breed,sex,birth_date,notes');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON visits
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,tutor_id,starts_at,duration_minutes,address,base_cents,status');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON visit_patients
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('organization_id,visit_id,patient_id,reason');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON consultations
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,visit_id,patient_id,notes,vitals,status');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON products
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,name,unit,cost_cents,sale_cents,active');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON applications
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,consultation_id,product_id,product_name,unit,quantity_milli,unit_cost_cents,unit_sale_cents,total_cents,batch,route');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON prescriptions
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,consultation_id,items,instructions,status');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON attachments
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,name,mime,size');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON exams
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,patient_id,consultation_id,request_id,kind,name,mode,partner,notes,attachment_id,occurred_on');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON exam_links
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('organization_id,exam_id,consultation_id');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON payments
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,visit_id,amount_cents,method');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON expenses
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,visit_id,description,category,amount_cents,occurred_on,paid_on,notes,status');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON timeline
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,patient_id,consultation_id,title,text,occurred_at');
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON practice_settings
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('organization_id,company_name,veterinarian_name,veterinarian_title,crmv,sipeagro,phone,email,cnpj,veterinarian_cpf,primary_color');
