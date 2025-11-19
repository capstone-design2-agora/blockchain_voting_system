import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = path.resolve(process.cwd());
const HISTORY_DIR = path.join(PROJECT_ROOT, "blockchain_contracts", "artifacts", "admin-history");
const HISTORY_FILE = path.join(HISTORY_DIR, "latest-success.json");

export const ADMIN_HISTORY_DIR = HISTORY_DIR;

export async function persistLatestBallotConfig(config) {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  const payload = {
    ...config,
    recordedAt: new Date().toISOString()
  };
  await fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2), "utf8");
  return HISTORY_FILE;
}

export async function persistDeploymentRecord(record) {
  if (!record?.runId) {
    throw new Error("Deployment record must include a runId");
  }
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  const target = path.join(HISTORY_DIR, `${record.runId}.json`);
  await fs.writeFile(target, JSON.stringify(record, null, 2), "utf8");
  return target;
}

export async function readLatestBallotConfig() {
  try {
    const content = await fs.readFile(HISTORY_FILE, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
