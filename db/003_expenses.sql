CREATE TABLE expenses (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), visit_id uuid,
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 240),
 category text NOT NULL CHECK(category IN ('Combustível','Estacionamento / pedágio','Laboratório','Taxas de pagamento','Materiais e serviços','Compra de produtos','Outras despesas')),
 amount_cents integer NOT NULL CHECK(amount_cents>0), occurred_on date NOT NULL, paid_on date,
 notes text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','voided')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,visit_id) REFERENCES visits(organization_id,id)
);
CREATE INDEX expenses_period ON expenses(organization_id,occurred_on);
CREATE INDEX expenses_paid ON expenses(organization_id,paid_on);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_scope ON expenses
 USING (organization_id=current_setting('app.current_org',true))
 WITH CHECK (organization_id=current_setting('app.current_org',true));
