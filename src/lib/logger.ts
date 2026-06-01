type LogLevel = "debug" | "info" | "warn" | "error";

type LogFn = (msg: string, meta?: Record<string, unknown>) => void;

function logAt(level: LogLevel): LogFn {
  return (msg, meta) => {
    const entry: Record<string, unknown> = { level, msg, ts: new Date().toISOString() };
    if (meta) Object.assign(entry, meta);
    const out = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
      process.stderr.write(out + "\n");
    } else {
      process.stdout.write(out + "\n");
    }
  };
}

export const logger = {
  debug: logAt("debug"),
  info: logAt("info"),
  warn: logAt("warn"),
  error: logAt("error"),
};
