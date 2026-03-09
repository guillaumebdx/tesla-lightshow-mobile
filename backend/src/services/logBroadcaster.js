/**
 * Log broadcaster — captures console.log output and broadcasts to SSE clients.
 * Also stores recent logs in a ring buffer for new clients.
 */

const MAX_BUFFER = 500;
const logBuffer = [];
const clients = new Set();

// Intercept console.log to capture all backend logs
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);

function broadcast(level, message) {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER) logBuffer.shift();

  const data = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of clients) {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  }
}

// Override console.log and console.error
console.log = (...args) => {
  originalLog(...args);
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  broadcast('info', message);
};

console.error = (...args) => {
  originalError(...args);
  const message = args.map(a => typeof a === 'string' ? a : (a instanceof Error ? a.message : JSON.stringify(a))).join(' ');
  broadcast('error', message);
};

/**
 * Add a new SSE client.
 */
function addClient(res) {
  clients.add(res);

  // Send recent buffer to new client
  for (const entry of logBuffer) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  res.on('close', () => {
    clients.delete(res);
  });
}

/**
 * Get the current log buffer.
 */
function getRecentLogs(count = 100) {
  return logBuffer.slice(-count);
}

module.exports = { addClient, getRecentLogs };
