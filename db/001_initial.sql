CREATE TABLE organizations (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE tutors (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 name text NOT NULL, phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', address text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id)
);
CREATE TABLE patients (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), tutor_id uuid NOT NULL,
 name text NOT NULL, species text NOT NULL DEFAULT 'Não informada', breed text NOT NULL DEFAULT '',
 sex text NOT NULL DEFAULT 'Não informado', birth_date date, notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,tutor_id) REFERENCES tutors(organization_id,id)
);
CREATE TABLE visits (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), tutor_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 15 AND 480),
 address text NOT NULL, base_cents integer NOT NULL DEFAULT 0 CHECK(base_cents>=0),
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,tutor_id) REFERENCES tutors(organization_id,id)
);
CREATE TABLE visit_patients (
 organization_id text NOT NULL REFERENCES organizations(id), visit_id uuid NOT NULL, patient_id uuid NOT NULL,
 reason text NOT NULL DEFAULT '', PRIMARY KEY(visit_id,patient_id),
 FOREIGN KEY(organization_id,visit_id) REFERENCES visits(organization_id,id),
 FOREIGN KEY(organization_id,patient_id) REFERENCES patients(organization_id,id)
);
CREATE TABLE consultations (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), visit_id uuid NOT NULL, patient_id uuid NOT NULL,
 notes text NOT NULL DEFAULT '', vitals jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
 revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(visit_id,patient_id),
 FOREIGN KEY(organization_id,visit_id) REFERENCES visits(organization_id,id),
 FOREIGN KEY(organization_id,patient_id) REFERENCES patients(organization_id,id),
 FOREIGN KEY(visit_id,patient_id) REFERENCES visit_patients(visit_id,patient_id)
);
CREATE TABLE products (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), name text NOT NULL,
 unit text NOT NULL CHECK(unit IN ('mL','dose','unidade','comprimido','g')),
 cost_cents integer NOT NULL CHECK(cost_cents>=0), sale_cents integer NOT NULL CHECK(sale_cents>=0),
 active boolean NOT NULL DEFAULT true, UNIQUE(organization_id,id)
);
CREATE TABLE applications (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), consultation_id uuid NOT NULL, product_id uuid NOT NULL,
 product_name text NOT NULL, unit text NOT NULL, quantity_milli integer NOT NULL CHECK(quantity_milli>0),
 unit_cost_cents integer NOT NULL CHECK(unit_cost_cents>=0), unit_sale_cents integer NOT NULL CHECK(unit_sale_cents>=0),
 total_cents integer NOT NULL CHECK(total_cents>=0), batch text NOT NULL DEFAULT '', route text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,consultation_id) REFERENCES consultations(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES products(organization_id,id)
);
CREATE TABLE prescriptions (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), consultation_id uuid NOT NULL,
 items jsonb NOT NULL, instructions text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,consultation_id) REFERENCES consultations(organization_id,id)
);
CREATE TABLE attachments (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 name text NOT NULL, mime text NOT NULL CHECK(mime='application/pdf'), data bytea NOT NULL,
 size integer NOT NULL CHECK(size>0 AND size<=15728640), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id)
);
CREATE TABLE exams (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), patient_id uuid NOT NULL,
 consultation_id uuid, request_id uuid, kind text NOT NULL CHECK(kind IN ('order','result')),
 name text NOT NULL, mode text NOT NULL DEFAULT '', partner text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
 attachment_id uuid, occurred_on date NOT NULL DEFAULT CURRENT_DATE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id),
 CHECK(kind <> 'order' OR (request_id IS NULL AND attachment_id IS NULL)),
 CHECK(kind <> 'result' OR attachment_id IS NOT NULL),
 FOREIGN KEY(organization_id,patient_id) REFERENCES patients(organization_id,id),
 FOREIGN KEY(organization_id,consultation_id) REFERENCES consultations(organization_id,id),
 FOREIGN KEY(organization_id,request_id) REFERENCES exams(organization_id,id),
 FOREIGN KEY(organization_id,attachment_id) REFERENCES attachments(organization_id,id)
);
CREATE TABLE exam_links (
 organization_id text NOT NULL REFERENCES organizations(id), exam_id uuid NOT NULL, consultation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(exam_id,consultation_id),
 FOREIGN KEY(organization_id,exam_id) REFERENCES exams(organization_id,id),
 FOREIGN KEY(organization_id,consultation_id) REFERENCES consultations(organization_id,id)
);
CREATE TABLE payments (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), visit_id uuid NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents>0), method text NOT NULL CHECK(method IN ('Pix','Dinheiro','Crédito','Débito','Link de pagamento')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,visit_id) REFERENCES visits(organization_id,id)
);
CREATE TABLE timeline (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), patient_id uuid NOT NULL,
 consultation_id uuid, type text NOT NULL CHECK(type IN ('consultation','application','prescription','exam_order','exam_result','note')),
 entity_id uuid, title text NOT NULL, text text NOT NULL DEFAULT '', occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,patient_id) REFERENCES patients(organization_id,id),
 FOREIGN KEY(organization_id,consultation_id) REFERENCES consultations(organization_id,id),
 UNIQUE(type,entity_id)
);
CREATE TABLE mutations (
 organization_id text NOT NULL REFERENCES organizations(id), id uuid NOT NULL,
 request_hash text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,id)
);
CREATE TABLE audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 action text NOT NULL, entity_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX timeline_patient_date ON timeline(organization_id,patient_id,occurred_at DESC);
CREATE INDEX visits_date ON visits(organization_id,starts_at);
CREATE INDEX exams_patient ON exams(organization_id,patient_id);
CREATE INDEX patients_tutor ON patients(organization_id,tutor_id);
CREATE INDEX application_consultation ON applications(organization_id,consultation_id);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['tutors','patients','visits','visit_patients','consultations','products','applications','prescriptions','attachments','exams','exam_links','payments','timeline','mutations','audit_log'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY organization_scope ON %I USING (organization_id = current_setting(''app.current_org'',true)) WITH CHECK (organization_id = current_setting(''app.current_org'',true))',t);
 END LOOP;
END $$;
