#!/bin/bash

# Quick Git commit and push script
# Usage: ./scripts/quick-commit.sh "Your commit message"
# Or just: ./scripts/quick-commit.sh (will prompt for message)

set -e  # Exit on error

echo "🔍 Checking Git status..."
git status --short

echo ""
echo "📝 Staging all changes..."
git add -A

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "❌ No changes to commit!"
    exit 0
fi

echo ""
echo "📋 Changes to be committed:"
git diff --cached --stat

echo ""

# Get commit message
if [ -z "$1" ]; then
    echo "💬 Enter commit message:"
    read -r commit_message
else
    commit_message="$1"
fi

if [ -z "$commit_message" ]; then
    echo "❌ Commit message cannot be empty!"
    exit 1
fi

echo ""
echo "💾 Committing changes..."
git commit -m "$commit_message"

echo ""
echo "🚀 Pushing to origin..."
git push

echo ""
echo "✅ Successfully committed and pushed: '$commit_message'"
echo ""
echo "📊 Final status:"
git status --short
