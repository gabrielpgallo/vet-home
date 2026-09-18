import "./env";
import { deploymentErrors } from "../src/lib/deployment";
const errors = deploymentErrors(process.env);
if (errors.length) {
  console.error(
    "Configuração de implantação incompleta:\n" +
      errors.map((e) => `- ${e}`).join("\n"),
  );
  process.exit(1);
}
