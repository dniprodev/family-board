const baseUrl = process.argv[2] ?? process.env.FAMILY_BOARD_URL;

if (!baseUrl) {
  console.error(
    "Usage: npm run smoke:health -- https://family-board.<subdomain>.workers.dev",
  );
  process.exit(1);
}

let healthUrl = `${baseUrl}/api/health`;

try {
  healthUrl = new URL("/api/health", baseUrl).toString();
  const response = await fetch(healthUrl);
  const body = await response.text();

  if (response.status !== 200) {
    throw new Error(`expected HTTP 200, received HTTP ${response.status}`);
  }

  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("expected the health check to return JSON");
  }

  if (body !== '{"status":"ok"}') {
    throw new Error(`unexpected health response body: ${body}`);
  }

  const configUrl = new URL("/api/config", baseUrl).toString();
  const configResponse = await fetch(configUrl);
  const configBody = await configResponse.json();
  const configKeys = Object.keys(configBody ?? {}).sort();

  if (configResponse.status !== 200) {
    throw new Error(`expected public config HTTP 200, received HTTP ${configResponse.status}`);
  }

  if (
    configKeys.length !== 1 ||
    configKeys[0] !== "turnstileSiteKey" ||
    typeof configBody?.turnstileSiteKey !== "string" ||
    configBody.turnstileSiteKey.length === 0
  ) {
    throw new Error("public config exposed unexpected fields or no site key");
  }

  const shellUrl = new URL("/read/health-check", baseUrl).toString();
  const shellResponse = await fetch(shellUrl, {
    headers: { accept: "text/html" },
  });
  const shellBody = await shellResponse.text();

  if (
    shellResponse.status !== 200 ||
    !shellResponse.headers.get("content-type")?.includes("text/html") ||
    !shellBody.includes("/manifest.webmanifest")
  ) {
    throw new Error("SPA shell route did not return HTML");
  }

  console.log(`Production health/config/SPA checks passed: ${healthUrl}`);
} catch (error) {
  console.error(
    `Health check failed for ${healthUrl}: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}
