require('dotenv').config({ path: __dirname + '/.env' });

module.exports = {
  apps: [{
    name: 'rxroute',
    script: 'dist/index.cjs',
    cwd: '/home/ubuntu/RxRouteOptimizer',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=3072',
    }
  }]
}
