#!/bin/bash
cd /Users/gcd/Repositories/main/personal-data-store
npx tsx scripts/snapshot-yield-positions.ts >> /tmp/yield-snapshot.log 2>&1
echo "$(date): Yield snapshot complete" >> /tmp/yield-snapshot.log
