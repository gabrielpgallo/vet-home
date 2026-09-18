import { describe, it, expect } from "vitest";
import { deploymentErrors } from "../src/lib/deployment";
const env = {
  VERCEL: "1",
  AUTH_MODE: "google",
  APP_LOCAL_MODE: "false",
  DATABASE_URL:
    "postgresql://vet_app.example:placeholder@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full",
  BETTER_AUTH_URL: "https://example.vercel.app",
  BETTER_AUTH_SECRET: "x".repeat(32),
  GOOGLE_CLIENT_ID: "placeholder",
  GOOGLE_CLIENT_SECRET: "placeholder",
  APP_ORG_ID: "example",
};
describe("deployment configuration", () => {
  it("uses the Vercel production domain before the first successful deploy", () => {
    expect(
      deploymentErrors({
        ...env,
        BETTER_AUTH_URL: undefined,
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "vet-example.vercel.app",
      }),
    ).toEqual([]);
  });
  it("does not reuse the production domain in preview", () => {
    expect(
      deploymentErrors({
        ...env,
        BETTER_AUTH_URL: undefined,
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "vet-example.vercel.app",
      }),
    ).toContain("BETTER_AUTH_URL inválida.");
  });
  it("accepts an authenticated remote configuration", () =>
    expect(deploymentErrors(env)).toEqual([]));
  it("rejects a local bypass on Vercel", () =>
    expect(
      deploymentErrors({ ...env, AUTH_MODE: "local", APP_LOCAL_MODE: "true" }),
    ).toHaveLength(2));
  it("rejects privileged database roles", () =>
    expect(
      deploymentErrors({
        ...env,
        DATABASE_URL: env.DATABASE_URL.replace(
          "vet_app.example",
          "postgres.example",
        ),
      }),
    ).toContain("DATABASE_URL deve usar o papel vet_app, sujeito a RLS."));
  it("does not reveal secrets in validation errors", () =>
    expect(
      deploymentErrors({ ...env, DATABASE_URL: "invalid-secret" }).join(),
    ).not.toContain("invalid-secret"));
  it("leaves local development available", () =>
    expect(deploymentErrors({ AUTH_MODE: "local" })).toEqual([]));
});
