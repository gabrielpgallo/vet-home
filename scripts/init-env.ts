import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
try {
  await access(".env");
  console.log(".env já existe; nenhuma credencial foi alterada.");
} catch {
  const owner = randomBytes(20).toString("hex"),
    app = randomBytes(20).toString("hex");
  await writeFile(
    ".env",
    `POSTGRES_PASSWORD=${owner}\nAPP_DB_PASSWORD=${app}\nADMIN_DATABASE_URL=postgresql://vet_owner:${owner}@127.0.0.1:55435/vet_domicilio\nDATABASE_URL=postgresql://vet_app:${app}@127.0.0.1:55435/vet_domicilio\nAPP_LOCAL_MODE=true\nAPP_ORG_ID=ar-saude-animal\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(".env criado com credenciais locais aleatórias.");
}
