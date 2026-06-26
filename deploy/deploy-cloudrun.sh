#!/usr/bin/env bash
# Deploy Vector Accuracy Studio to Google Cloud Run.
# Usage: ./deploy/deploy-cloudrun.sh [PROJECT_ID] [REGION]
# Run from the project root (outputs/vector-accuracy-studio/).
set -euo pipefail

PROJECT="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${2:-europe-west1}"
SERVICE="vector-accuracy-studio"

if [ -z "${PROJECT}" ]; then
  echo "No project set. Pass it: ./deploy/deploy-cloudrun.sh YOUR_PROJECT_ID [region]" >&2
  exit 1
fi

echo "Deploying '${SERVICE}' to project '${PROJECT}' in '${REGION}'..."

# One-time-safe: enable the APIs Cloud Run + source deploy need.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --project "${PROJECT}"

# Build from source (Cloud Build uses the Dockerfile) and deploy.
# --allow-unauthenticated makes the URL PUBLIC. Remove that flag to require auth.
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --port 8080 \
  --allow-unauthenticated

echo "Done. URL above. (Re-run this script to redeploy after code changes.)"
