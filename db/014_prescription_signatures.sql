CREATE TABLE prescription_signatures (
 organization_id text NOT NULL REFERENCES organizations(id),
 prescription_id uuid PRIMARY KEY,
 id uuid GENERATED ALWAYS AS (prescription_id) STORED,
 attempt_id uuid NOT NULL,
 actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 prepared_pdf bytea, signed_attributes bytea,
 certificate bytea NOT NULL, certificate_chain jsonb NOT NULL,
 signer_name text NOT NULL, fingerprint text NOT NULL, expected_cpf text NOT NULL,
 source_hash text NOT NULL,
 signed_pdf bytea, signed_at timestamptz, pdf_sha256 text,
 validation_scope text NOT NULL DEFAULT 'signature_chain_dates_no_revocation',
 FOREIGN KEY(organization_id,prescription_id) REFERENCES prescriptions(organization_id,id),
 CHECK ((signed_at IS NULL AND signed_pdf IS NULL) OR (signed_at IS NOT NULL AND signed_pdf IS NOT NULL AND pdf_sha256 IS NOT NULL)),
 CHECK (octet_length(prepared_pdf)<=4194304 AND octet_length(signed_pdf)<=4194304)
);
ALTER TABLE prescription_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_scope ON prescription_signatures
 USING (organization_id=current_setting('app.current_org',true))
 WITH CHECK (organization_id=current_setting('app.current_org',true));
CREATE FUNCTION protect_signed_prescription() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.signed_at IS NOT NULL AND current_user='vet_app' THEN
  RAISE EXCEPTION 'Signed prescriptions are immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_signed_pdf BEFORE UPDATE OR DELETE ON prescription_signatures
 FOR EACH ROW EXECUTE FUNCTION protect_signed_prescription();
CREATE TRIGGER clinic_change AFTER INSERT OR UPDATE OR DELETE ON prescription_signatures
 FOR EACH ROW EXECUTE FUNCTION capture_clinic_change('id,organization_id,prescription_id,attempt_id,signer_name,fingerprint,signed_at,pdf_sha256,validation_scope');
