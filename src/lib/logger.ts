type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  msg: string;
  [key: string]: unknown;
}

function log(level: LogLevel, payload: LogPayload): void {
  const entry = JSON.stringify({ level, ts: new Date().toISOString(), ...payload });
  if (level === "error" || level === "warn") {
    process.stderr.write(entry + "\n");
  } else {
    process.stdout.write(entry + "\n");
  }
}

export const logger = {
  debug: (payload: LogPayload) => log("debug", payload),
  info: (payload: LogPayload) => log("info", payload),
  warn: (payload: LogPayload) => log("warn", payload),
  error: (payload: LogPayload) => log("error", payload),
};
