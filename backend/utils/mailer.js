import nodemailer from "nodemailer";

let transporterPromise = null;

function normalizeBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeRecipients(recipients) {
  if (!recipients) return [];
  const toArray = Array.isArray(recipients)
    ? recipients
    : String(recipients).split(/[,;]+/);

  return toArray
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);
}

function normalizeTransportList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => {
      if (!value) return "";
      if (typeof value === "string") return value.trim();
      if (typeof value === "object" && value.address) {
        return String(value.address).trim();
      }
      return String(value).trim();
    })
    .filter(Boolean);
}

function extractAddressKey(value) {
  if (!value) return "";
  const stringValue = String(value).trim();
  if (!stringValue) return "";
  const match = stringValue.match(/<([^>]+)>/);
  const address = match ? match[1] : stringValue;
  return address.trim().toLowerCase();
}

function buildRecipientLists(input) {
  const seen = new Set();
  const toList = [];
  const ccList = [];
  const bccList = [];

  const add = (address, bucket) => {
    const trimmed = String(address || "").trim();
    if (!trimmed) return;
    const key = extractAddressKey(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    bucket.push(trimmed);
  };

  normalizeRecipients(input?.to).forEach((value) => add(value, toList));
  normalizeRecipients(input?.cc).forEach((value) => add(value, ccList));
  normalizeRecipients(input?.bcc).forEach((value) => add(value, bccList));

  return { toList, ccList, bccList };
}

function formatSenderAddress(address) {
  if (!address) return null;
  const trimmed = String(address).trim();
  if (!trimmed) return null;
  if (trimmed.includes("<")) {
    return trimmed;
  }
  const displayName = String(process.env.MAIL_NAME || "").trim();
  return displayName ? `${displayName} <${trimmed}>` : trimmed;
}

function formatReplyToAddress(address) {
  if (!address) return null;
  const trimmed = String(address).trim();
  if (!trimmed) return null;
  return trimmed.includes("<") ? trimmed : trimmed;
}

export function isMailConfigured() {
  return Boolean(
    (process.env.SMTP_SERVICE || process.env.SMTP_HOST) &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function createTransporter() {
  if (!isMailConfigured()) {
    throw new Error("Email service is not configured");
  }

  const service = process.env.SMTP_SERVICE;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const usePool = normalizeBoolean(process.env.SMTP_POOL, false);
  const logger = normalizeBoolean(process.env.SMTP_LOGGER, false);
  const debug = normalizeBoolean(process.env.SMTP_DEBUG, false);
  const rejectUnauthorized = normalizeBoolean(
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED,
    true
  );

  if (!user || !pass) {
    throw new Error(
      "SMTP credentials are not configured. Set SMTP_USER and SMTP_PASS."
    );
  }

  const maxConnections = Number.parseInt(
    process.env.SMTP_MAX_CONNECTIONS || "5",
    10
  );
  const maxMessages = Number.parseInt(
    process.env.SMTP_MAX_MESSAGES || "100",
    10
  );

  // Log configuration for debugging (without sensitive data)
  console.log("Creating SMTP transporter with config:", {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE,
    service: service,
    user: user?.substring(0, 10) + "...",
    pool: usePool,
    rejectUnauthorized,
  });

  const transporterConfig = {
    pool: usePool,
    logger,
    debug,
    auth: {
      user,
      pass,
    },
    // Add connection timeout settings for cloud platforms
    connectionTimeout: 60000, // 60 seconds
    greetingTimeout: 30000, // 30 seconds
    socketTimeout: 60000, // 60 seconds
    // Additional settings for better cloud compatibility
    requireTLS: true,
    maxConnections: usePool ? maxConnections : 1,
  };

  if (service) {
    transporterConfig.service = service;
  }

  const host = process.env.SMTP_HOST;
  if (host) {
    transporterConfig.host = host;
  }

  const portEnv = process.env.SMTP_PORT;
  if (portEnv) {
    transporterConfig.port = Number.parseInt(portEnv, 10);
  } else if (!transporterConfig.port) {
    transporterConfig.port = service ? undefined : 587;
  }

  const secureEnv = process.env.SMTP_SECURE;
  if (secureEnv != null) {
    transporterConfig.secure = normalizeBoolean(
      secureEnv,
      transporterConfig.port === 465
    );
  } else if (
    transporterConfig.port != null &&
    transporterConfig.secure == null
  ) {
    transporterConfig.secure = transporterConfig.port === 465;
  }

  if (usePool) {
    if (Number.isFinite(maxConnections)) {
      transporterConfig.maxConnections = maxConnections;
    }
    if (Number.isFinite(maxMessages)) {
      transporterConfig.maxMessages = maxMessages;
    }
  }

  // Configure TLS settings for better compatibility
  transporterConfig.tls = {
    rejectUnauthorized: rejectUnauthorized,
    // Simplified TLS options for better cloud platform compatibility
    servername: host || undefined,
  };

  return nodemailer.createTransport(transporterConfig);
}

async function ensureTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const transporter = createTransporter();
      const shouldVerify = normalizeBoolean(
        process.env.SMTP_VERIFY_CONNECTION,
        false // Default to false to avoid timeout issues on cloud platforms
      );
      if (shouldVerify) {
        try {
          await transporter.verify();
          console.log("SMTP connection verified successfully");
        } catch (error) {
          console.warn(
            "SMTP verification failed, but continuing:",
            error.message
          );
          // Don't throw error, just log warning
        }
      }
      return transporter;
    })();
  }

  return transporterPromise;
}

export async function sendMail({
  to,
  subject,
  text,
  html,
  from,
  cc,
  bcc,
  replyTo,
  attachments,
  headers,
} = {}) {
  if (!isMailConfigured()) {
    throw new Error("Email service is not configured");
  }

  const transporter = await ensureTransporter();
  const { toList, ccList, bccList } = buildRecipientLists({ to, cc, bcc });

  if (!toList.length) {
    throw new Error("No recipients provided");
  }

  const fromSource = process.env.MAIL_FROM || process.env.SMTP_USER;
  const formattedFrom = formatSenderAddress(from || fromSource);
  if (!formattedFrom) {
    throw new Error(
      "No sender address configured. Set MAIL_FROM environment variable."
    );
  }

  const formattedReplyTo = formatReplyToAddress(replyTo);
  const finalSubject = typeof subject === "string" ? subject.trim() : "";

  const message = {
    from: formattedFrom,
    to: toList,
    subject: finalSubject,
  };

  if (typeof text === "string" && text.length > 0) {
    message.text = text;
  }

  if (typeof html === "string" && html.length > 0) {
    message.html = html;
  }

  if (ccList.length) {
    message.cc = ccList;
  }

  if (bccList.length) {
    message.bcc = bccList;
  }

  if (formattedReplyTo) {
    message.replyTo = formattedReplyTo;
  }

  if (Array.isArray(attachments) && attachments.length) {
    message.attachments = attachments;
  }

  if (headers && typeof headers === "object") {
    message.headers = headers;
  }

  let info;
  try {
    info = await transporter.sendMail(message);
  } catch (error) {
    const enhancedError = new Error(
      `Email dispatch failed: ${error?.message || "Unknown error"}`
    );
    if (typeof error?.responseCode === "number") {
      enhancedError.statusCode = error.responseCode;
    }
    if (error?.code) {
      enhancedError.code = error.code;
    }
    if (error?.response) {
      enhancedError.response = error.response;
    }
    enhancedError.cause = error;
    throw enhancedError;
  }
  const previewUrl = nodemailer.getTestMessageUrl
    ? nodemailer.getTestMessageUrl(info)
    : null;

  const accepted = normalizeTransportList(info.accepted);
  const rejected = normalizeTransportList(info.rejected);
  const pending = normalizeTransportList(info.pending);
  const success =
    accepted.length > 0 || (rejected.length === 0 && pending.length === 0);

  const shouldLog = normalizeBoolean(
    process.env.MAIL_DEBUG_LOG,
    process.env.NODE_ENV !== "production"
  );

  if (shouldLog) {
    console.info(
      `[mailer] Email dispatched to ${accepted.join(", ") || toList.join(", ")}`
    );
  }

  return {
    success,
    messageId: info.messageId,
    envelopeFrom: info.envelope?.from || message.from,
    envelopeTo: info.envelope?.to || [...toList, ...ccList, ...bccList],
    accepted,
    rejected,
    pending,
    response: info.response,
    from: message.from,
    to: toList,
    cc: ccList,
    bcc: bccList,
    replyTo: formattedReplyTo || null,
    previewUrl,
  };
}

export async function verifyMailer() {
  if (!isMailConfigured()) {
    return false;
  }

  try {
    const transporter = await ensureTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.warn("SMTP verification failed:", error.message);
    if (error.code === "ETIMEDOUT") {
      console.warn(
        "This might be due to cloud platform network restrictions. Email functionality may still work during actual sending."
      );
    }
    return false;
  }
}
