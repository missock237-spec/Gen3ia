#!/bin/bash
set -e
echo "Installing Genova..."
if ! command -v node &> /dev/null; then
    echo "Node.js is required. Please install Node.js 20+"
    exit 1
fi
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"
echo "Installing dependencies..."
npm install
echo "Generating Prisma client..."
npx prisma generate
echo "Pushing database schema..."
npx prisma db push
echo "Setup complete! Run: npm run dev"
