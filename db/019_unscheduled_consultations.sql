-- Direct consultations have a billing visit, but no calendar appointment.
ALTER TABLE visits ADD COLUMN origin text NOT NULL DEFAULT 'scheduled' CHECK(origin IN ('scheduled','direct'));
ALTER TABLE visits ADD COLUMN performed_on date;
UPDATE visits SET performed_on=(starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
ALTER TABLE visits ALTER COLUMN starts_at DROP NOT NULL;
ALTER TABLE visits DROP CONSTRAINT visits_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_status_check CHECK(status IN ('draft','scheduled','completed','cancelled'));
ALTER TABLE visits ADD CONSTRAINT visits_appointment_date CHECK(origin='direct' OR starts_at IS NOT NULL);
ALTER TABLE consultations ADD COLUMN occurred_on date;
ALTER TABLE consultations ADD COLUMN occurred_time time;
UPDATE consultations c SET occurred_on=v.performed_on,occurred_time=(v.starts_at AT TIME ZONE 'America/Sao_Paulo')::time FROM visits v WHERE v.id=c.visit_id;
ALTER TABLE consultations ADD CONSTRAINT completed_consultation_date CHECK(status<>'completed' OR occurred_on IS NOT NULL);
