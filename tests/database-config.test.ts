import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseConfig } from "../src/lib/database-config";

afterEach(() => vi.unstubAllEnvs());
describe("database TLS configuration", () => {
  it("preserves the existing connection settings without a custom CA", () => {
    vi.stubEnv("DATABASE_SSL_CA", "");
    const url = "postgresql://localhost/example";
    expect(databaseConfig(url)).toEqual({ connectionString: url });
  });
  it("keeps CA verification enabled even if URL parameters disable SSL", () => {
    vi.stubEnv("DATABASE_SSL_CA", "line1\\nline2");
    const result = databaseConfig(
      "postgresql://example.com/db?sslmode=disable&ssl=false&uselibpqcompat=true&application_name=vet",
    );
    expect(result.ssl).toEqual({
      ca: "line1\nline2",
      rejectUnauthorized: true,
    });
    const url = new URL(result.connectionString!);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("ssl")).toBe(false);
    expect(url.searchParams.has("uselibpqcompat")).toBe(false);
    expect(url.searchParams.get("application_name")).toBe("vet");
  });
});
