ALTER TABLE practice_settings
  ADD COLUMN primary_color text NOT NULL DEFAULT '#245bdb'
  CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$');
