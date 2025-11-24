import { spawn } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { once } from "node:events";
import crypto from "node:crypto";

import { ADMIN_HISTORY_DIR, persistDeploymentRecord, persistLatestBallotConfig } from "./admin-history.js";
import { createTempDeployEnv } from "./deploy-template.js";

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTRACTS_DIR = path.join(PROJECT_ROOT, "blockchain_contracts");
const SCRIPT_PATH = path.join(CONTRACTS_DIR, "scripts", "setup_and_deploy.sh");
const ARTIFACTS_DIR = path.join(CONTRACTS_DIR, "artifacts");

const runStates = new Map();
let deploymentLock = false;

class DeploymentBusyError extends Error {
  constructor() {
    super("Deployment already in progress");
    this.name = "DeploymentBusyError";
    this.code = "DEPLOYMENT_BUSY";
  }
}

function generateRunId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(8).toString("hex");
}

function createLogFilePath(runId) {
  return path.join(ADMIN_HISTORY_DIR, `${runId}.log`);
}

function summarizeContracts(deployment) {
  if (!deployment?.contracts) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(deployment.contracts).map(([name, details]) => [
      name,
      {
        name: details.name,
        address: details.address,
        transactionHash: details.transactionHash,
        gasUsed: details.gasUsed,
        ballot: details.ballot,
        proposals: details.proposals,
        pledges: details.pledges
      }
    ])
  );
}

async function readDeploymentArtifact() {
  const target = path.join(ARTIFACTS_DIR, "sbt_deployment.json");
  try {
    const content = await fsPromises.readFile(target, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function snapshotStatus(state) {
  return {
    runId: state.runId,
    status: state.status,
    exitCode: state.exitCode ?? null,
    error: state.error ?? null,
    createdAt: state.createdAt,
    completedAt: state.completedAt
  };
}

function sendEvent(res, event, payload) {
  try {
    const serialized = JSON.stringify(payload);
    res.write(`event: ${event}\ndata: ${serialized}\n\n`);
    return true;
  } catch (error) {
    return false;
  }
}

function broadcastEvent(runId, event, payload) {
  const state = runStates.get(runId);
  if (!state) {
    return;
  }
  for (const res of Array.from(state.subscribers)) {
    if (res.writableEnded) {
      state.subscribers.delete(res);
      continue;
    }
    const ok = sendEvent(res, event, payload);
    if (!ok) {
      state.subscribers.delete(res);
    }
  }
}

export function isDeploymentBusy() {
  return deploymentLock;
}

export function getRunState(runId) {
  return runStates.get(runId);
}

export function attachDeploymentSubscriber(runId, req, res) {
  const state = runStates.get(runId);
  if (!state) {
    return null;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.write(": connected\n\n");
  res.write("retry: 10000\n\n");
  res.flushHeaders?.();

  const cleanup = () => {
    state.subscribers.delete(res);
  };

  state.subscribers.add(res);
  req.once("close", cleanup);
  res.once("close", cleanup);

  sendEvent(res, "status", snapshotStatus(state));
  if (state.record && state.status !== "running") {
    sendEvent(res, "result", state.record);
  }
  return state;
}

async function finalizeRun(state, config, logStream, tempEnv, exitCode, runtimeError) {
  state.exitCode = exitCode ?? null;
  state.completedAt = new Date().toISOString();
  state.error = runtimeError?.message ?? null;
  state.status = runtimeError ? "failed" : exitCode === 0 ? "success" : "failed";

  if (logStream && !logStream.writableEnded) {
    try {
      await once(logStream, "finish");
    } catch (error) {
      // ignore finish errors to avoid blocking finalization
    }
  }

  let deploymentSnapshot = null;
  try {
    deploymentSnapshot = await readDeploymentArtifact();
  } catch (error) {
    console.error("Unable to read deployment artifact:", error);
  }

  const contractSummary = summarizeContracts(deploymentSnapshot);
  const logsPath = path.relative(PROJECT_ROOT, state.logFilePath);
  const record = {
    runId: state.runId,
    status: state.status,
    exitCode: state.exitCode,
    createdAt: state.createdAt,
    completedAt: state.completedAt,
    logsPath,
    config,
    contracts: contractSummary,
    error: state.error,
    timestamp: state.completedAt
  };
  state.record = record;

  try {
    await persistDeploymentRecord(record);
  } catch (error) {
    console.error("Failed to persist deployment record", error);
  }

  if (state.status === "success") {
    try {
      await persistLatestBallotConfig(config);
    } catch (error) {
      console.error("Failed to persist latest ballot config", error);
    }
  }

  broadcastEvent(state.runId, "status", snapshotStatus(state));
  broadcastEvent(state.runId, "result", record);

  deploymentLock = false;

  try {
    await tempEnv.cleanup();
  } catch (error) {
    console.error("Failed to cleanup temporary deploy env", error);
  }
}

function handleLine(state, logStream, streamName, line) {
  if (!line) {
    return;
  }
  logStream.write(`[${streamName.toUpperCase()}] ${line}\n`);
  broadcastEvent(state.runId, "log", {
    stream: streamName,
    line,
    timestamp: new Date().toISOString()
  });
}

async function executeRun(state, config, tempEnv) {
  state.status = "running";
  broadcastEvent(state.runId, "status", snapshotStatus(state));

  let logStream;
  let exitCode = null;
  let runtimeError = null;

  try {
    await fsPromises.mkdir(path.dirname(state.logFilePath), { recursive: true });
    logStream = fs.createWriteStream(state.logFilePath, { flags: "a", encoding: "utf8" });
    const child = spawn("bash", [SCRIPT_PATH], {
      cwd: CONTRACTS_DIR,
      env: { ...process.env, DEPLOY_ENV_FILE: tempEnv.path },
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (child.stdout) {
      const stdoutReader = readline.createInterface({ input: child.stdout });
      stdoutReader.on("line", (line) => handleLine(state, logStream, "stdout", line));
      child.stdout.on("error", (error) => {
        console.error("Error reading stdout", error);
      });
    }

    if (child.stderr) {
      const stderrReader = readline.createInterface({ input: child.stderr });
      stderrReader.on("line", (line) => handleLine(state, logStream, "stderr", line));
      child.stderr.on("error", (error) => {
        console.error("Error reading stderr", error);
      });
    }

    exitCode = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
  } catch (error) {
    runtimeError = error;
  } finally {
    if (logStream && !logStream.writableEnded) {
      logStream.end();
    }
    await finalizeRun(state, config, logStream, tempEnv, exitCode, runtimeError);
  }
}

export async function startDeployment(config) {
  if (deploymentLock) {
    throw new DeploymentBusyError();
  }
  deploymentLock = true;

  const runId = `admin-deploy-${generateRunId()}`;
  const state = {
    runId,
    status: "starting",
    createdAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
    error: null,
    subscribers: new Set(),
    logFilePath: createLogFilePath(runId),
    record: null
  };
  runStates.set(runId, state);

  try {
    const tempEnv = await createTempDeployEnv(config);
    void executeRun(state, config, tempEnv);
    return runId;
  } catch (error) {
    deploymentLock = false;
    runStates.delete(runId);
    throw error;
  }
}

export { DeploymentBusyError };
