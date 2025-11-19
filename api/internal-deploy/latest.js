import { validateAdminDeployToken, TOKEN_HEADER } from "../_lib/admin-deploy-token.js";
import { readLatestBallotConfig } from "../_lib/admin-history.js";

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

  try {
    const config = await readLatestBallotConfig();
    if (!config) {
      return res.status(404).json({ error: "LATEST_CONFIG_NOT_FOUND" });
    }
    return res.status(200).json({
      success: true,
      config
    });
  } catch (error) {
    console.error("/api/internal-deploy/latest", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
