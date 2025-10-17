#!/bin/bash

# Deploy script for Vaulty Onboarding Bot
# Usage: ./deploy.sh "commit message"

if [ -z "$1" ]; then
  echo "❌ Error: Please provide a commit message"
  echo "Usage: ./deploy.sh \"your commit message\""
  exit 1
fi

echo "🚀 Deploying Vaulty Onboarding Bot..."
echo "📝 Commit message: $1"
echo

# Add all changes
echo "📦 Adding changes..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "$1"

# Push to GitHub (backup/source control)
echo "📤 Pushing to GitHub..."
git push github main

# Push to Heroku (production deployment)
echo "🚀 Deploying to Heroku..."
git push heroku main

echo
echo "✅ Deployment complete!"
echo "📊 GitHub: https://github.com/NYTEMODEONLY/cv-onboarding-bot"
echo "🤖 Heroku: https://vaulty-onboarding-bot-1689126e98c5.herokuapp.com/"
echo








