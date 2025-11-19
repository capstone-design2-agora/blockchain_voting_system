import { BallotConfigSchema } from "./_lib/ballot-config.js";
import { readJsonBody } from "./_lib/request.js";
import { validateAdminDeployToken, TOKEN_HEADER } from "./_lib/admin-deploy-token.js";
import { startDeployment, DeploymentBusyError } from "./_lib/deploy-runner.js";

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

  const tokenCheck = validateAdminDeployToken(req);
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

    const runId = await startDeployment(parsed.data);
    return res.status(200).json({
      success: true,
      runId
    });
  } catch (error) {
    if (error instanceof DeploymentBusyError) {
      return res.status(409).json({ error: "DEPLOYMENT_BUSY" });
    }
    console.error("/api/internal-deploy", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
