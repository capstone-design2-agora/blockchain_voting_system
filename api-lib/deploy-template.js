import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTRACTS_DIR = path.join(PROJECT_ROOT, "blockchain_contracts");
const TEMPLATE_PATH = path.join(CONTRACTS_DIR, "deploy.templates.env");
const TMP_DIR = path.join(CONTRACTS_DIR, "tmp");

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function serializeProposals(config) {
  const names = config.proposals
    .map((entry) => entry.name.trim())
    .filter(Boolean);

  const pledgeGroups = config.proposals.map((entry) => {
    const pledges = (entry.pledges || [])
      .map((pledge) => pledge.trim())
      .filter(Boolean);
    return pledges.join("|");
  });

  return {
    proposals: names.join(","),
    pledges: pledgeGroups.join(";")
  };
}

async function loadTemplate() {
  return fs.readFile(TEMPLATE_PATH, "utf8");
}

function applyReplacements(template, replacements) {
  return Object.entries(replacements).reduce((current, [key, value]) => {
    return current.split(`{{${key}}}`).join(value);
  }, template);
}

export async function renderDeployEnv(config) {
  const template = await loadTemplate();
  const { proposals, pledges } = serializeProposals(config);
  const replacements = {
    ballotId: normalizeValue(config.ballotId),
    title: normalizeValue(config.title),
    description: normalizeValue(config.description),
    opensAt: normalizeValue(config.schedule.opensAt),
    closesAt: normalizeValue(config.schedule.closesAt),
    announcesAt: normalizeValue(config.schedule.announcesAt),
    expectedVoters: normalizeValue(config.expectedVoters),
    proposals,
    pledges,
    mascotCid: normalizeValue(config.mascotCid),
    verifierAddress: normalizeValue(config.verifierAddress)
  };

  return applyReplacements(template, replacements);
}

function generateId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

export async function createTempDeployEnv(config) {
  const content = await renderDeployEnv(config);
  await fs.mkdir(TMP_DIR, { recursive: true });
  const fileName = `deploy-${generateId()}.env`;
  const filePath = path.join(TMP_DIR, fileName);
  await fs.writeFile(filePath, content, "utf8");

  return {
    path: filePath,
    cleanup: async () => {
      try {
        await fs.rm(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  };
}
