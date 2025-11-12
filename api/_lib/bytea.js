export function bufferToPgBytea(buffer) {
  if (!buffer) return null;
  return `\\x${Buffer.from(buffer).toString("hex")}`;
}

export function pgByteaToBuffer(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === "string") {
    if (value.startsWith("\\x")) {
      const normalized = value.slice(2);
      return Buffer.from(normalized, "hex");
    }
    if (value.startsWith("\\\\x")) {
      const normalized = value.slice(3);
      return Buffer.from(normalized, "hex");
    }
    // Try base64 decode as fallback
    try {
      return Buffer.from(value, "base64");
    } catch (error) {
      throw new Error(`Unable to parse bytea string: ${error.message}`);
    }
  }
  if (typeof value === "object" && value?.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  throw new Error("Unsupported bytea value");
}

export function bufferToHex(buffer) {
  return `0x${Buffer.from(buffer).toString("hex")}`;
}

export function hexToBuffer(hex) {
  if (!hex) return null;
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(normalized, "hex");
}
