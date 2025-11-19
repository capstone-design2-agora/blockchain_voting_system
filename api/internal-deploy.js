import { BallotConfigSchema } from "./_lib/ballot-config.js";
import { readJsonBody } from "./_lib/request.js";

const ADMIN_TOKEN = process.env.ADMIN_DEPLOY_TOKEN;
const TOKEN_HEADER = "x-admin-deploy-token";

function getBearerToken(headerValue) {
  if (!headerValue) {
    return null;
  }
  const [type, token] = headerValue.trim().split(" ");
  if (token && type.toLowerCase() === "bearer") {
    return token;
  }
  return headerValue;
}

function validateToken(req) {
  if (!ADMIN_TOKEN) {
    return { ok: false, status: 500, body: { error: "ADMIN_DEPLOY_TOKEN_MISSING" } };
  }
  const provided = getBearerToken(req.headers[TOKEN_HEADER]) || getBearerToken(req.headers.authorization);
  if (!provided || provided !== ADMIN_TOKEN) {
    return { ok: false, status: 403, body: { error: "ADMIN_DEPLOY_TOKEN_INVALID" } };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", `${TOKEN_HEADER}, Authorization, Content-Type`);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const tokenCheck = validateToken(req);
  if (!tokenCheck.ok) {
    return res.status(tokenCheck.status).json(tokenCheck.body);
  }

  try {
    const body = await readJsonBody(req);
    const parsed = BallotConfigSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "BALLLOT_CONFIG_INVALID",
        details: parsed.error.issues
      });
    }

    // Placeholder until runner implementation: acknowledge and reserve a run ID.
    return res.status(200).json({
      success: true,
      runId: `dry-${Date.now()}`,
      config: parsed.data
    });
  } catch (error) {
    console.error("/api/internal-deploy", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
