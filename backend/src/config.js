const fs = require('fs');
const path = require('path');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const defaultConfig = {
  schedulers: {
    autoCompletePollMs: 60 * 1000,
    guestRetentionPollMs: 24 * 60 * 60 * 1000,
  },
  guest: {
    publicAccessDays: 90,
    dataRetentionDays: 365,
    cancelReasonRequired: true,
    rateLimit: {
      windowMs: 5 * 60 * 1000,
      max: 60,
    },
    pin: {
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
    },
  },
  booking: {
    comments: {
      requireTeacherPrivateOnComplete: true,
      requireStudentCommentOnComplete: true,
    },
  },
};

function loadAppConfig() {
  const defaultPath = path.join(__dirname, '..', 'config', 'app.config.json');
  const configPath = process.env.APP_CONFIG_FILE || defaultPath;

  let fileConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(raw);
    }
  } catch (err) {
    console.error('failed to load app config file', { configPath, message: err?.message || String(err) });
  }

  const merged = deepMerge(defaultConfig, fileConfig);
  return {
    configPath,
    appConfig: merged,
  };
}

module.exports = {
  loadAppConfig,
};
