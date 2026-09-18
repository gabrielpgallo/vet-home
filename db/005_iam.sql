CREATE TABLE iam_memberships (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 user_id text NOT NULL REFERENCES auth_user(id),
 role text NOT NULL CHECK(role IN ('admin','veterinarian','assistant')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,user_id)
);
CREATE TABLE iam_invitations (
 id uuid PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
 email text NOT NULL CHECK(email=lower(email)), role text NOT NULL CHECK(role IN ('admin','veterinarian','assistant')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL, accepted_by text REFERENCES auth_user(id)
);
CREATE UNIQUE INDEX iam_pending_email ON iam_invitations(organization_id,email) WHERE status='pending';
CREATE INDEX iam_user_membership ON iam_memberships(user_id,status);
CREATE INDEX iam_invite_email ON iam_invitations(email,status);
ALTER TABLE audit_log ADD COLUMN actor_id text NOT NULL DEFAULT COALESCE(NULLIF(current_setting('app.actor_id',true),''),'system');
-- Identity tables are global: login resolves memberships before opening an RLS-scoped transaction.
-- Clinical and financial tables retain organization-scoped RLS. IAM queries explicitly constrain org/user.
