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

  console.log(`Health check passed: ${healthUrl}`);
} catch (error) {
  console.error(
    `Health check failed for ${healthUrl}: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}
