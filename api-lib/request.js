export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const buffer = Buffer.concat(chunks);
  const str = buffer.toString("utf8");
  return str ? JSON.parse(str) : {};
}

export function getRequestIp(req) {
  const header = req.headers["x-forwarded-for"] || req.headers["x-real-ip"];
  if (!header) return undefined;
  if (Array.isArray(header)) {
    return header[0];
  }
  return header.split(",")[0]?.trim();
}
