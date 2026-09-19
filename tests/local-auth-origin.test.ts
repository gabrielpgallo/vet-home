import { it, expect } from "vitest";
import { localAuthOrigin } from "../src/lib/local-auth-origin";
it("normalizes local aliases without trusting arbitrary origins", () => {
  expect(
    localAuthOrigin("localhost:3010", "http://127.0.0.1:3010", false),
  ).toBe("http://127.0.0.1:3010");
  expect(
    localAuthOrigin("127.0.0.1:3010", "http://localhost:3010", false),
  ).toBe("http://localhost:3010");
  for (const host of [
    "127.0.0.1:3010",
    "localhost:9999",
    "evil.example",
    "localhost.evil.example:3010",
  ])
    expect(localAuthOrigin(host, "http://127.0.0.1:3010", false)).toBeNull();
  expect(
    localAuthOrigin("localhost:3010", "http://127.0.0.1:3010", true),
  ).toBeNull();
  expect(
    localAuthOrigin("localhost:3010", "https://vet.app.pypora.com", false),
  ).toBeNull();
});
