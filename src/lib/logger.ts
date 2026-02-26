/**
 * Minimal structured logger.
 *
 * Emits JSON lines to stdout (info) / stderr (warn, error).
 * Never logs session contents, label values, or user-submitted text.
 */
export const logger = {
  info(event: string, meta?: Record<string, unknown>): void {
    const entry = { level: 'info', event, ts: new Date().toISOString(), ...meta };
    process.stdout.write(JSON.stringify(entry) + '\n');
  },

  warn(event: string, meta?: Record<string, unknown>): void {
    const entry = { level: 'warn', event, ts: new Date().toISOString(), ...meta };
    process.stderr.write(JSON.stringify(entry) + '\n');
  },

  error(event: string, meta?: Record<string, unknown>): void {
    const entry = { level: 'error', event, ts: new Date().toISOString(), ...meta };
    process.stderr.write(JSON.stringify(entry) + '\n');
  },
};
