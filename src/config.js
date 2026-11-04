/** Config validation for dsh-task-heartbeat (0.2.0 G1). Zero dependencies. */
export class ConfigError extends Error {
  constructor(errors) {
    super(`invalid dsh-task-heartbeat config:\n- ${errors.join('\n- ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

const DEFAULTS = Object.freeze({ stateFile: null, defaultTtlS: 900 });

export function validateConfig(raw = {}) {
  const errors = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError(['config: must be a plain object']);
  for (const key of Object.keys(raw)) {
    if (!(key in DEFAULTS)) errors.push(`config: unknown key "${key}" (allowed: ${Object.keys(DEFAULTS).join(', ')})`);
  }
  if (raw.stateFile !== undefined && raw.stateFile !== null) {
    if (typeof raw.stateFile !== 'string' || raw.stateFile.trim() === '') errors.push('stateFile: must be a non-empty string or null');
  }
  if (raw.defaultTtlS !== undefined) {
    if (typeof raw.defaultTtlS !== 'number' || !Number.isFinite(raw.defaultTtlS) || raw.defaultTtlS <= 0) {
      errors.push('defaultTtlS: must be a finite number > 0');
    }
  }
  if (errors.length) throw new ConfigError(errors);
  return {
    config: {
      stateFile: raw.stateFile ?? null,
      defaultTtlS: raw.defaultTtlS ?? DEFAULTS.defaultTtlS,
    },
  };
}
