ALTER TABLE practice_settings
  ADD COLUMN phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 60),
  ADD COLUMN email text NOT NULL DEFAULT '' CHECK (length(email) <= 150),
  ADD COLUMN cnpj text NOT NULL DEFAULT '' CHECK (length(cnpj) <= 30),
  ADD COLUMN veterinarian_cpf text NOT NULL DEFAULT '' CHECK (length(veterinarian_cpf) <= 20);

ALTER TABLE tutors
  ADD COLUMN document text NOT NULL DEFAULT '' CHECK (length(document) <= 30);
