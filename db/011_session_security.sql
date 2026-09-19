ALTER TABLE auth_session ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE iam_memberships ADD COLUMN sessions_valid_after timestamptz NOT NULL DEFAULT '-infinity';

-- Global authentication events: only server-side, scoped explicitly when displayed.
CREATE TABLE security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  user_id text REFERENCES auth_user(id) ON DELETE CASCADE,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX security_events_user_created ON security_events(user_id,created_at DESC);
CREATE INDEX security_events_org_created ON security_events(organization_id,created_at DESC);
REVOKE ALL ON security_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON security_events FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON security_events FROM authenticated;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vet_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON security_events TO vet_app;
    GRANT USAGE,SELECT ON SEQUENCE security_events_id_seq TO vet_app;
  END IF;
END;
$$;

CREATE FUNCTION audit_auth_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO security_events(action,user_id) VALUES('session.created',NEW."userId");
  ELSIF EXISTS(SELECT 1 FROM auth_user WHERE id=OLD."userId") THEN
    INSERT INTO security_events(action,user_id) VALUES('session.revoked',OLD."userId");
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER auth_session_audit AFTER INSERT OR DELETE ON auth_session
  FOR EACH ROW EXECUTE FUNCTION audit_auth_session();
