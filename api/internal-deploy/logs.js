import { validateAdminDeployToken, TOKEN_HEADER } from "../_lib/admin-deploy-token.js";
import { attachDeploymentSubscriber, getRunState } from "../_lib/deploy-runner.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", `${TOKEN_HEADER}, Authorization`);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const tokenCheck = validateAdminDeployToken(req);
  if (!tokenCheck.ok) {
    return res.status(tokenCheck.status).json(tokenCheck.body);
  }

  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "", `http://${host}`);
  const runId = url.searchParams.get("runId");
  if (!runId) {
    return res.status(400).json({ error: "RUN_ID_REQUIRED" });
  }

  const runState = getRunState(runId);
  if (!runState) {
    return res.status(404).json({ error: "RUN_NOT_FOUND" });
  }

  attachDeploymentSubscriber(runId, req, res);
  // Keep the connection open for SSE; handler intentionally does not call res.end()
  return;
}
