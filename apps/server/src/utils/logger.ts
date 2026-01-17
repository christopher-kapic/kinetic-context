/**
 * Logger utility that adds timestamps to all log messages.
 * Format: [YYYY-MM-DD HH:mm:ss.SSS] [prefix] message
 */

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function formatMessage(prefix: string, ...args: unknown[]): unknown[] {
  const timestamp = formatTimestamp();
  const prefixWithTimestamp = `[${timestamp}] ${prefix}`;
  
  // If first argument is a string, prepend the prefix to it
  if (args.length > 0 && typeof args[0] === "string") {
    return [prefixWithTimestamp + " " + args[0], ...args.slice(1)];
  }
  
  // Otherwise, add prefix as first argument
  return [prefixWithTimestamp, ...args];
}

export const logger = {
  /**
   * Logs a message with timestamp
   * @param prefix - Prefix to add to the log message (e.g., "[opencode]")
   * @param args - Arguments to pass to console.log
   */
  log(prefix: string, ...args: unknown[]): void {
    console.log(...formatMessage(prefix, ...args));
  },

  /**
   * Logs an error message with timestamp
   * @param prefix - Prefix to add to the log message (e.g., "[opencode]")
   * @param args - Arguments to pass to console.error
   */
  error(prefix: string, ...args: unknown[]): void {
    console.error(...formatMessage(prefix, ...args));
  },

  /**
   * Logs a warning message with timestamp
   * @param prefix - Prefix to add to the log message (e.g., "[opencode]")
   * @param args - Arguments to pass to console.warn
   */
  warn(prefix: string, ...args: unknown[]): void {
    console.warn(...formatMessage(prefix, ...args));
  },
};
