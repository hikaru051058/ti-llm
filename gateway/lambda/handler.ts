import crypto from "crypto";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand
} from "@aws-sdk/client-secrets-manager";
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

const secrets = new SecretsManagerClient({
  region: process.env.AWS_REGION
});

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION
});

/* ---------- ENV ---------- */
const FACTORY_SECRET = process.env.FACTORY_SECRET;
const FACTORY_SECRET_ARN = process.env.FACTORY_SECRET_ARN;
const FACTORY_SECRET_NAME =
  process.env.FACTORY_SECRET_NAME || "ti-llm/factory-secret";
const DEVICE_KEYS_SECRET_ARN = process.env.DEVICE_KEYS_SECRET_ARN;
const DEVICE_KEYS_SECRET_NAME =
  process.env.DEVICE_KEYS_SECRET_NAME || "ti-llm/device-keys";

/* ---------- Cache ---------- */
let cachedDeviceKeys: Record<string, string> = {};
let cachedFactorySecret: string | null = null;

/* ---------- Helpers ---------- */
async function loadDeviceKeys(): Promise<Record<string, string>> {
  if (Object.keys(cachedDeviceKeys).length > 0) {
    return cachedDeviceKeys;
  }

  const secretId = DEVICE_KEYS_SECRET_NAME || DEVICE_KEYS_SECRET_ARN!;

  console.log("loading device keys from", secretId);

  const res = await secrets.send(
    new GetSecretValueCommand({
      SecretId: secretId
    })
  );

  try {
    cachedDeviceKeys = JSON.parse(res.SecretString || "{}");
  } catch {
    cachedDeviceKeys = {};
  }

  return cachedDeviceKeys;
}

async function loadFactorySecret(): Promise<string> {
  if (cachedFactorySecret) return cachedFactorySecret;
  if (FACTORY_SECRET) {
    cachedFactorySecret = FACTORY_SECRET;
    return cachedFactorySecret;
  }

  const secretId = FACTORY_SECRET_NAME || FACTORY_SECRET_ARN!;

  console.log("loading factory secret from", secretId);

  if (!secretId) {
    throw new Error("FACTORY secret id not configured");
  }

  const res = await secrets.send(
    new GetSecretValueCommand({
      SecretId: secretId
    })
  );

  cachedFactorySecret = res.SecretString || "";
  if (!cachedFactorySecret) {
    throw new Error("factory secret empty");
  }
  return cachedFactorySecret;
}

/* ---------- Handler ---------- */
export const handler = async (event: any) => {
  try {
    const path = event.resource || event.path || "";
    const headers = event.headers || {};

    const rawBody = event.body || "";
    const body = event.isBase64Encoded
      ? Buffer.from(rawBody, "base64").toString("utf-8")
      : rawBody;

    console.log("request", { path, body });

    /* ================= PROVISION ================= */
    if (path.includes("provision")) {
      const { device_id, ts, sig } = JSON.parse(body);

      if (!device_id || !ts || !sig) {
        return { statusCode: 400, body: "BAD REQUEST" };
      }

      // replay protection (±60s)
      if (Math.abs(Date.now() / 1000 - ts) > 60) {
        return { statusCode: 403, body: "STALE" };
      }

      const secret = await loadFactorySecret();
      const msg = `${device_id}:${ts}`;
      const expected = crypto
        .createHmac("sha256", secret)
        .update(msg)
        .digest();

      let providedSig: Buffer;
      try {
        providedSig = Buffer.from(sig, "hex");
      } catch {
        return { statusCode: 403, body: "INVALID SIGNATURE" };
      }

      if (
        providedSig.length !== expected.length ||
        !crypto.timingSafeEqual(providedSig, expected)
      ) {
        return { statusCode: 403, body: "INVALID SIGNATURE" };
      }

      // issue API key
      const apiKey = crypto.randomBytes(16).toString("hex");
      const keys = await loadDeviceKeys();
      keys[device_id] = apiKey;

      await secrets.send(
        new PutSecretValueCommand({
          SecretId: DEVICE_KEYS_SECRET_ARN,
          SecretString: JSON.stringify(keys)
        })
      );

      cachedDeviceKeys = keys;

      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain" },
        body: apiKey
      };
    }

    /* ================= ASK (later) ================= */
    if (path.includes("ask")) {
      const apiKey =
        headers["x-esp-key"] ||
        headers["X-ESP-KEY"] ||
        headers["X-Esp-Key"];

      const keys = await loadDeviceKeys();

      if (!apiKey || !Object.values(keys).includes(apiKey)) {
        return { statusCode: 403, body: "FORBIDDEN" };
      }

      if (body === "INIT") {
        return { statusCode: 200, body: "OK" };
      }
      if (body === "EXIT") {
        return { statusCode: 200, body: "BYE" };
      }
      if (!body) {
        return { statusCode: 400, body: "EMPTY" };
      }

      const modelId =
        process.env.LLM_MODEL_ID ||
        "anthropic.claude-3-haiku-20240307-v1:0";

      const cmd = new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 256,
          messages: [
            { role: "user", content: body.slice(0, 512) }
          ]
        })
      });

      const res = await bedrock.send(cmd);
      const raw = Buffer.from(res.body!).toString("utf-8");
      const parsed = JSON.parse(raw);
      const text = parsed.content?.[0]?.text ?? "";

      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain" },
        body: text.slice(0, 1500)
      };
    }

    return { statusCode: 404, body: "NOT FOUND" };

  } catch (err) {
    console.error("FATAL", err);
    return { statusCode: 500, body: "INTERNAL ERROR" };
  }
};
