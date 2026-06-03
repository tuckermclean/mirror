type Meta = Record<string, unknown>;

function format(level: string, msg: string, meta?: Meta): string {
  return JSON.stringify({ level, msg, ...meta });
}

export const logger = {
  info(msg: string, meta?: Meta): void {
    console.info(format("info", msg, meta));
  },
  warn(msg: string, meta?: Meta): void {
    console.warn(format("warn", msg, meta));
  },
  error(msg: string, meta?: Meta): void {
    console.error(format("error", msg, meta));
  },
};
