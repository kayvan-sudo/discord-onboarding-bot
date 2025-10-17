const levels = ['error', 'warn', 'info', 'debug'];

function getLevel() {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return levels.includes(raw) ? raw : 'info';
}

const current = getLevel();

function shouldLog(level) {
  return levels.indexOf(level) <= levels.indexOf(current);
}

module.exports = {
  error: (...args) => { if (shouldLog('error')) console.error('[error]', ...args); },
  warn: (...args) => { if (shouldLog('warn')) console.warn('[warn]', ...args); },
  info: (...args) => { if (shouldLog('info')) console.log('[info]', ...args); },
  debug: (...args) => { if (shouldLog('debug')) console.log('[debug]', ...args); },
};

