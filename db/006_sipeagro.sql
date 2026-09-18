ALTER TABLE practice_settings
 ADD COLUMN sipeagro text NOT NULL DEFAULT '' CHECK(length(sipeagro)<=60);
