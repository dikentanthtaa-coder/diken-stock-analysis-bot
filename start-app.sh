#!/bin/bash
# Production launcher for Dkn Stock Research
cd "$(dirname "$0")"
export NODE_ENV=production
# Build only if the build output is missing or older than sources
if [ ! -d .next/standalone ] && [ ! -f .next/BUILD_ID ]; then
  pnpm build || exit 1
fi
exec pnpm start --port 3000
