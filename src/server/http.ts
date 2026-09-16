import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./db";
export function apiError(error: unknown) {
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { error: "Formato de dados inválido." },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error:
          "Confira os campos: " +
          error.issues
            .map((i) => i.path.join(".") + " — " + i.message)
            .slice(0, 3)
            .join("; "),
      },
      { status: 400 },
    );
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return NextResponse.json(
    {
      error:
        "Não foi possível concluir a operação. Seus dados no formulário foram preservados.",
    },
    { status: 500 },
  );
}
