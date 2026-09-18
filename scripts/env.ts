import { config } from "dotenv";
if (process.env.ENV_FILE) {
  const result = config({ path: process.env.ENV_FILE, quiet: true });
  if (result.error) throw new Error("Não foi possível ler ENV_FILE.");
} else {
  config({ path: ".env.local", quiet: true });
  config({ path: ".env", quiet: true });
}
