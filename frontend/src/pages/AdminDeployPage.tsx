import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import "./AdminDeployPage.css";

type ProposalEntry = {
  id: string;
  name: string;
  pledgesRaw: string;
};

const ADMIN_TOKEN_KEY = "admin-deploy-token";

type FormState = {
  ballotId: string;
  title: string;
  description: string;
  expectedVoters: string;
  schedule: {
    opensAt: string;
    closesAt: string;
    announcesAt: string;
  };
  mascotCid: string;
  verifierAddress: string;
  proposals: ProposalEntry[];
};

type DeploymentStatus = {
  runId: string;
  status: "starting" | "running" | "success" | "failed";
  exitCode: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type DeploymentResult = {
  runId: string;
  status: "success" | "failed" | string;
  contracts?: Record<
    string,
    {
      name: string;
      address: string;
      transactionHash: string;
      gasUsed?: number;
    }
  >;
  logsPath?: string;
  config?: Record<string, any>;
  error?: string | null;
};

const createProposalEntry = (): ProposalEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  pledgesRaw: ""
});

const createDefaultFormState = (): FormState => ({
  ballotId: "",
  title: "",
  description: "",
  expectedVoters: "1000",
  schedule: {
    opensAt: "",
    closesAt: "",
    announcesAt: ""
  },
  mascotCid: "",
  verifierAddress: "",
  proposals: [createProposalEntry()]
});

export default function AdminDeployPage() {
  const requiredToken = process.env.REACT_APP_ADMIN_TOKEN;
  const [tokenInput, setTokenInput] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(createDefaultFormState());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<DeploymentStatus | null>(null);
  const [runResult, setRunResult] = useState<DeploymentResult | null>(null);
  const [logs, setLogs] = useState<
    {
      id: string;
      stream: string;
      line: string;
      timestamp: string;
    }[]
  >([]);
  const [sseError, setSseError] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "" : "";
    setTokenInput(stored);
    setTokenValue(stored);
  }, []);

  const isAuthorized = useMemo(() => {
    if (requiredToken) {
      return tokenValue === requiredToken;
    }
    return tokenValue.length > 0;
  }, [requiredToken, tokenValue]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const preparedProposals = useMemo(
    () =>
      formState.proposals
        .map((proposal) => ({
          name: proposal.name.trim(),
          pledges: proposal.pledgesRaw
            .split("|")
            .map((pledge) => pledge.trim())
            .filter(Boolean)
        }))
        .filter((proposal) => proposal.name && proposal.pledges.length > 0),
    [formState.proposals]
  );

  const deploymentPayload = useMemo(() => {
    const expected = Number(formState.expectedVoters);
    return {
      ballotId: formState.ballotId.trim(),
      title: formState.title.trim(),
      description: formState.description.trim(),
      expectedVoters: Number.isFinite(expected) && expected > 0 ? expected : 0,
      schedule: {
        opensAt: formState.schedule.opensAt.trim(),
        closesAt: formState.schedule.closesAt.trim(),
        announcesAt: formState.schedule.announcesAt.trim()
      },
      proposals: preparedProposals,
      mascotCid: formState.mascotCid.trim() || undefined,
      verifierAddress: formState.verifierAddress.trim() || undefined
    };
  }, [formState, preparedProposals]);

  const jsonPreview = useMemo(() => JSON.stringify(deploymentPayload, null, 2), [deploymentPayload]);

  const handleTokenSave = (event: FormEvent) => {
    event.preventDefault();
    if (!tokenInput) {
      setTokenMessage("Token is required.");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, tokenInput);
    }
    setTokenValue(tokenInput);
    if (requiredToken && tokenInput !== requiredToken) {
      setTokenMessage("Token saved but does not match the configured value.");
    } else {
      setTokenMessage("Token saved.");
    }
  };

  const handleFormChange = (field: keyof Omit<FormState, "schedule" | "proposals">, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleScheduleChange = (field: keyof FormState["schedule"], value: string) => {
    setFormState((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [field]: value
      }
    }));
  };

  const handleProposalChange = (index: number, value: string, field: keyof ProposalEntry) => {
    setFormState((prev) => {
      const next = [...prev.proposals];
      next[index] = {
        ...next[index],
        [field]: value
      };
      return {
        ...prev,
        proposals: next
      };
    });
  };

  const addProposal = () => {
    setFormState((prev) => ({
      ...prev,
      proposals: [...prev.proposals, createProposalEntry()]
    }));
  };

  const removeProposal = (index: number) => {
    setFormState((prev) => {
      if (prev.proposals.length <= 1) {
        return prev;
      }
      const next = [...prev.proposals];
      next.splice(index, 1);
      return {
        ...prev,
        proposals: next
      };
    });
  };

  const formatNano = (value: string) => {
    if (!value) {
      return "n/a";
    }
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return "invalid date";
    }
    return (BigInt(timestamp) * BigInt(1000000)).toString();
  };

  const appendLog = (entry: { stream: string; line: string; timestamp: string }) => {
    setLogs((prev) => {
      const next = [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          ...entry
        }
      ];
      return next.slice(-400);
    });
  };

  const connectLogStream = (runId: string) => {
    if (!tokenValue && !requiredToken) {
      setSseError(true);
      return;
    }
    eventSourceRef.current?.close();
    setLogs([]);
    setSseError(false);
    const queryToken = encodeURIComponent(tokenValue);
    const source = new EventSource(`/api/internal-deploy/logs?runId=${encodeURIComponent(runId)}&token=${queryToken}`);
    eventSourceRef.current = source;

    source.addEventListener("log", (event) => {
      try {
        const payload = JSON.parse(event.data);
        appendLog(payload);
      } catch {
        appendLog({
          stream: "stderr",
          line: event.data,
          timestamp: new Date().toISOString()
        });
      }
    });

    source.addEventListener("status", (event) => {
      try {
        const payload = JSON.parse(event.data);
        setStatusSnapshot(payload);
      } catch (error) {
        console.error("Malformed status payload", error);
      }
    });

    source.addEventListener("result", (event) => {
      try {
        const payload = JSON.parse(event.data);
        setRunResult(payload);
      } catch (error) {
        console.error("Malformed result payload", error);
      }
    });

    source.onerror = () => {
      setSseError(true);
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setGlobalError(null);
    setRunResult(null);
    setStatusSnapshot(null);
    setLogs([]);
    setSseError(false);

    if (!isAuthorized) {
      setGlobalError("Please provide the admin token before deploying.");
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (tokenValue) {
        headers["x-admin-deploy-token"] = tokenValue;
      }

      const response = await fetch("/api/internal-deploy", {
        method: "POST",
        headers,
        body: jsonPreview
      });

      if (response.status === 409) {
        setGlobalError("A deployment is already running. Please try again later.");
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setGlobalError(payload.error || "Failed to start deployment.");
        return;
      }

      const data = await response.json();
      const runId = data.runId;
      connectLogStream(runId);
    } catch (error) {
      console.error("Deployment error", error);
      setGlobalError("Unable to start deployment. See console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrefillLatest = async () => {
    if (!isAuthorized) {
      setPrefillMessage("Provide the admin token before fetching the last config.");
      return;
    }
    setPrefillLoading(true);
    setPrefillMessage(null);
    try {
      const headers: Record<string, string> = {};
      if (tokenValue) {
        headers["x-admin-deploy-token"] = tokenValue;
      }
      const response = await fetch("/api/internal-deploy/latest", {
        method: "GET",
        headers
      });
      if (response.status === 404) {
        setPrefillMessage("No successful deployment has been recorded yet.");
        return;
      }
      if (!response.ok) {
        setPrefillMessage("Failed to load latest config.");
        return;
      }
      const payload = await response.json();
      if (payload?.config) {
        const config = payload.config;
        const proposals = Array.isArray(config.proposals) && config.proposals.length > 0
          ? config.proposals.map((proposal: any) => ({
              ...createProposalEntry(),
              name: proposal.name || "",
              pledgesRaw: Array.isArray(proposal.pledges) ? proposal.pledges.join("|") : ""
            }))
          : [createProposalEntry()];

        setFormState({
          ballotId: config.ballotId || "",
          title: config.title || "",
          description: config.description || "",
          expectedVoters: String(config.expectedVoters ?? ""),
          schedule: {
            opensAt: config.schedule?.opensAt || "",
            closesAt: config.schedule?.closesAt || "",
            announcesAt: config.schedule?.announcesAt || ""
          },
          mascotCid: config.mascotCid || "",
          verifierAddress: config.verifierAddress || "",
          proposals
        });
        setPrefillMessage("Latest config loaded into the form.");
      } else {
        setPrefillMessage("Latest config payload is missing.");
      }
    } catch (error) {
      console.error("Prefill error", error);
      setPrefillMessage("Unable to fetch the latest config.");
    } finally {
      setPrefillLoading(false);
    }
  };

  const badgesMap: Record<string, string> = {
    idle: "status-badge status-idle",
    starting: "status-badge status-starting",
    running: "status-badge status-running",
    success: "status-badge status-success",
    failed: "status-badge status-failed"
  };

  const currentStatusClass =
    badgesMap[statusSnapshot?.status ?? "idle"] ?? "status-badge status-idle";

  const handleExport = () => {
    const blob = new Blob([jsonPreview], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ballot-config${formState.ballotId ? `-${formState.ballotId}` : ""}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-deploy-page">
      <header className="admin-header">
        <h1>Admin Deployment Console</h1>
        <p>Trigger `setup_and_deploy.sh`, monitor logs, and store deployment artifacts locally.</p>
      </header>

      <section className="admin-token-panel">
        <form onSubmit={handleTokenSave} className="token-form">
          <label htmlFor="admin-token">Admin Token</label>
          <div className="token-input-row">
            <input
              id="admin-token"
              type="password"
              placeholder="Enter admin deploy token"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
            <button type="submit">Save token</button>
          </div>
          {tokenMessage && <small className="token-message">{tokenMessage}</small>}
          {requiredToken && (
            <small className="token-tip">
              Token must match the `REACT_APP_ADMIN_TOKEN` configured with the build/deploy environment.
            </small>
          )}
          {!requiredToken && (
            <small className="token-tip">
              No frontend token is configured; the backend still requires the valid admin token.
            </small>
          )}
          <p className={`token-status ${isAuthorized ? "token-status-ok" : "token-status-warn"}`}>
            {isAuthorized ? "Token accepted" : "Token does not match"}
          </p>
        </form>
      </section>

      <form className="admin-deploy-form" onSubmit={handleSubmit}>
        <section className="admin-section">
          <div className="section-header">
            <h2>Basic information</h2>
            <p>Ballot metadata used to populate the deployment template.</p>
          </div>
          <div className="admin-field-grid">
            <label>
              Ballot ID
              <input
                type="text"
                value={formState.ballotId}
                onChange={(event) => handleFormChange("ballotId", event.target.value)}
                placeholder="e.g., citizen-2026"
                required
              />
            </label>
            <label>
              Title
              <input
                type="text"
                value={formState.title}
                onChange={(event) => handleFormChange("title", event.target.value)}
                placeholder="Election for …"
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={formState.description}
                onChange={(event) => handleFormChange("description", event.target.value)}
                placeholder="Describe the ballot or context."
                rows={2}
                required
              />
            </label>
            <label>
              Expected voters
              <input
                type="number"
                min="1"
                value={formState.expectedVoters}
                onChange={(event) => handleFormChange("expectedVoters", event.target.value)}
                placeholder="1000"
                required
              />
            </label>
          </div>
        </section>

        <section className="admin-section">
          <div className="section-header">
            <h2>Schedule</h2>
            <p>Date/time pickers optionally show the nanosecond preview.</p>
          </div>
          <div className="admin-field-grid">
            <label>
              Opens at
              <input
                type="datetime-local"
                value={formState.schedule.opensAt}
                onChange={(event) => handleScheduleChange("opensAt", event.target.value)}
              />
              <small>nanoseconds: {formatNano(formState.schedule.opensAt)}</small>
            </label>
            <label>
              Closes at
              <input
                type="datetime-local"
                value={formState.schedule.closesAt}
                onChange={(event) => handleScheduleChange("closesAt", event.target.value)}
              />
              <small>nanoseconds: {formatNano(formState.schedule.closesAt)}</small>
            </label>
            <label>
              Announces at
              <input
                type="datetime-local"
                value={formState.schedule.announcesAt}
                onChange={(event) => handleScheduleChange("announcesAt", event.target.value)}
              />
              <small>nanoseconds: {formatNano(formState.schedule.announcesAt)}</small>
            </label>
          </div>
        </section>

        <section className="admin-section">
          <div className="section-header">
            <h2>Candidates & pledges</h2>
            <p>Enter candidate names and pipe-separated pledge groups that match the smart contract template.</p>
          </div>
          <div className="proposal-list">
          {formState.proposals.map((proposal, index) => (
            <div key={proposal.id} className="proposal-row">
                <div className="proposal-inputs">
                  <label>
                    Candidate name
                    <input
                      type="text"
                      value={proposal.name}
                      onChange={(event) => handleProposalChange(index, event.target.value, "name")}
                      placeholder="Alice Example"
                      required
                    />
                  </label>
                  <label>
                    Pledges (pipe `|` separated)
                    <input
                      type="text"
                      value={proposal.pledgesRaw}
                      onChange={(event) => handleProposalChange(index, event.target.value, "pledgesRaw")}
                      placeholder="Transparency|Accountability|Community"
                      required
                    />
                  </label>
                </div>
                <div className="proposal-actions">
                  <button type="button" onClick={() => removeProposal(index)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="secondary" onClick={addProposal}>
            Add another candidate
          </button>
        </section>

        <section className="admin-section">
          <div className="section-header">
            <h2>Assets</h2>
            <p>Optional metadata such as mascot IPFS CID or an overriding verifier address.</p>
          </div>
          <div className="admin-field-grid">
            <label>
              Mascot CID
              <input
                type="text"
                value={formState.mascotCid}
                onChange={(event) => handleFormChange("mascotCid", event.target.value)}
                placeholder="bafybeib..."
              />
            </label>
            <label>
              Verifier address
              <input
                type="text"
                value={formState.verifierAddress}
                onChange={(event) => handleFormChange("verifierAddress", event.target.value)}
                placeholder="0x..."
              />
            </label>
          </div>
        </section>

        <section className="admin-section preview-section">
          <div className="section-header">
            <h2>Config preview & actions</h2>
            <p>Review the sanitized JSON before submitting.</p>
          </div>
          <div className="preview-actions">
            <button type="button" onClick={handleExport}>
              Export config JSON
            </button>
            <button type="button" onClick={handlePrefillLatest} disabled={prefillLoading}>
              {prefillLoading ? "Fetching latest…" : "Prefill last success"}
            </button>
          </div>
          {prefillMessage && <p className="preview-note">{prefillMessage}</p>}
          <pre className="config-preview">{jsonPreview}</pre>
        </section>

        <div className="admin-actions">
          <button type="submit" disabled={isSubmitting || !isAuthorized}>
            {isSubmitting ? "Starting deployment…" : "Submit deployment"}
          </button>
          <button type="button" className="secondary" onClick={() => setFormState(createDefaultFormState())}>
            Reset form
          </button>
        </div>
        {globalError && <p className="error-text">{globalError}</p>}
      </form>

      <section className="admin-section log-section">
        <div className="section-header">
          <h2>Runner status & logs</h2>
          <p>Live SSE stream from the backend deployment runner.</p>
        </div>
        <div className="status-row">
          <span className={currentStatusClass}>
            {statusSnapshot ? statusSnapshot.status.toUpperCase() : "IDLE"}
          </span>
          <div className="status-meta">
            {statusSnapshot && (
              <>
                <p>Run ID: {statusSnapshot.runId}</p>
                <p>Started at: {new Date(statusSnapshot.createdAt).toLocaleString()}</p>
              </>
            )}
          </div>
          {sseError && <span className="sse-error">SSE connection failed (reconnects automatically).</span>}
        </div>
        <div className="log-panel">
          {logs.length === 0 && <p className="log-empty">No logs yet. Submit to start a deployment.</p>}
          {logs.map((entry) => (
            <div key={entry.id} className="log-entry">
              <span className="log-stream">{entry.stream}</span>
              <span className="log-line">{entry.line}</span>
              <span className="log-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
        {runResult && (
          <div className="result-panel">
            <h3>Last run ({runResult.status})</h3>
            {runResult.logsPath && <p>Logs: {runResult.logsPath}</p>}
            {runResult.contracts && (
              <div className="contracts-grid">
                {Object.entries(runResult.contracts).map(([name, info]) => (
                  <div key={name} className="contract-card">
                    <strong>{name}</strong>
                    <p>Address: {info.address}</p>
                    <p>Tx: {info.transactionHash}</p>
                    {info.gasUsed && <p>Gas used: {info.gasUsed}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
