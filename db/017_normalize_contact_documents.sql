-- Normalize presentation only. Never guess missing digits or rewrite prescription snapshots.
CREATE FUNCTION pg_temp.canonical_contact(value text, kind text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cleaned text;
BEGIN
 IF value IS NULL THEN RETURN value; END IF;
 IF kind='phone' THEN
  IF value !~ '^[0-9+().[:space:]-]*$' THEN RETURN value; END IF;
  cleaned:=regexp_replace(value,'[().[:space:]-]','','g');
  cleaned:=regexp_replace(cleaned,'^\+?55([0-9]{10,11})$','\1');
  IF cleaned ~ '^[0-9]{10,11}$' OR cleaned='' THEN RETURN cleaned; END IF;
 ELSE
  IF value !~ '^[A-Za-z0-9./()[:space:]-]*$' THEN RETURN value; END IF;
  cleaned:=upper(regexp_replace(value,'[./()[:space:]-]','','g'));
  IF cleaned='' OR (kind IN ('cpf','document') AND cleaned ~ '^[0-9]{11}$')
    OR (kind IN ('cnpj','document') AND cleaned ~ '^[A-Z0-9]{12}[0-9]{2}$') THEN RETURN cleaned; END IF;
 END IF;
 RETURN value;
END $$;
DO $$
DECLARE field record; revision_sql text;
BEGIN
 FOR field IN SELECT * FROM (VALUES
  ('tutors','phone','phone'),('tutors','document','document'),
  ('practice_settings','phone','phone'),('practice_settings','cnpj','cnpj'),
  ('practice_settings','veterinarian_cpf','cpf'),('professional_profiles','veterinarian_cpf','cpf')
 ) AS fields(table_name,column_name,kind)
 LOOP
  revision_sql:=CASE WHEN field.table_name IN ('practice_settings','professional_profiles') THEN ',revision=revision+1' ELSE '' END;
  EXECUTE format('UPDATE %I SET %I=pg_temp.canonical_contact(%I,%L)%s WHERE %I IS DISTINCT FROM pg_temp.canonical_contact(%I,%L)',field.table_name,field.column_name,field.column_name,field.kind,revision_sql,field.column_name,field.column_name,field.kind);
 END LOOP;
END $$;
DROP FUNCTION pg_temp.canonical_contact(text,text);
