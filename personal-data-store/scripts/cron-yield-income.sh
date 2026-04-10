#!/bin/bash
cd /Users/gcd/Repositories/main/personal-data-store
npx tsx scripts/calculate-yield-income.ts >> /tmp/yield-income.log 2>&1
echo "$(date): Yield income calculation complete" >> /tmp/yield-income.log
