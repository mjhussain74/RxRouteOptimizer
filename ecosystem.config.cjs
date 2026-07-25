const path = require('path');
const fs   = require('fs');
const envFile = path.join(__dirname, '.env');

const env = {};
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = val;
    });
}

module.exports = {
  apps: [{
    name:   'RxRouteOptimizer',
    script: 'dist/index.cjs',
    cwd:    '/home/ubuntu/RxRouteOptimizer',
    env: {
      ...env,
      NODE_ENV:     'production',
      NODE_OPTIONS: '--max-old-space-size=3072',
    }
  }]
};
