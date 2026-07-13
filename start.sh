#!/bin/bash
if [ ! -f dist/index.cjs ] || [ ! -f dist/public/index.html ]; then
  echo "Building application..."
  npm run build
fi
exec node dist/index.cjs
