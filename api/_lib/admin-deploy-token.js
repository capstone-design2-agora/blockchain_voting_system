const TOKEN_HEADER = "x-admin-deploy-token";
const ADMIN_TOKEN = process.env.ADMIN_DEPLOY_TOKEN;

function getBearerToken(value) {
  if (!value) {
    return null;
  }
  const parts = value.trim().split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return value;
}

function resolveTokenFromRequest(req) {
  const headerValue = req.headers[TOKEN_HEADER];
  const authorization = req.headers.authorization;
  const tokenFromHeader = getBearerToken(headerValue) || getBearerToken(authorization);
  if (tokenFromHeader) {
    return tokenFromHeader;
  }

  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "", `http://${host}`);
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      return queryToken;
    }
  } catch (error) {
    // Ignore invalid URL parsing
  }

  return null;
}

export function validateAdminDeployToken(req) {
  if (!ADMIN_TOKEN) {
    return { ok: false, status: 500, body: { error: "ADMIN_DEPLOY_TOKEN_MISSING" } };
  }
  const provided = resolveTokenFromRequest(req);
  if (!provided || provided !== ADMIN_TOKEN) {
    return { ok: false, status: 403, body: { error: "ADMIN_DEPLOY_TOKEN_INVALID" } };
  }
  return { ok: true };
}

export { TOKEN_HEADER };
