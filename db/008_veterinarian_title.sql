ALTER TABLE practice_settings
  ADD COLUMN veterinarian_title text NOT NULL DEFAULT 'Dra.'
  CHECK (veterinarian_title IN ('Dra.', 'Dr.'));
