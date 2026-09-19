// Use one host for OAuth state cookies and the registered callback URL.
export function localAuthOrigin(
  host: string,
  configured: string | undefined,
  deployed: boolean,
) {
  if (deployed || !configured) return null;
  try {
    const target = new URL(configured),
      current = new URL(`http://${host}`);
    const local = (name: string) =>
      name === "localhost" || name === "127.0.0.1";
    if (
      target.protocol !== "http:" ||
      !local(target.hostname) ||
      !local(current.hostname) ||
      current.port !== target.port ||
      current.host === target.host
    )
      return null;
    return target.origin;
  } catch {
    return null;
  }
}
