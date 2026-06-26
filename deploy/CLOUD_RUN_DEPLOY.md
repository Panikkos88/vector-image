# Deploy to Google Cloud Run

The app is a static browser app; Cloud Run serves it via nginx (Dockerfile at project root).
Chosen because it's future-proof for the planned V2 backend (job queue, WebSocket progress).

## One-time setup (you must do this — auth is yours)
1. Install the Google Cloud CLI: https://cloud.google.com/sdk/docs/install
2. Authenticate and pick your project:
   ```
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

## Deploy
From the project root (`outputs/vector-accuracy-studio/`):
```
bash deploy/deploy-cloudrun.sh YOUR_PROJECT_ID europe-west1
```
The script enables the needed APIs (run, cloudbuild, artifactregistry), builds from the
Dockerfile via Cloud Build, and deploys. It prints the public HTTPS URL.

## Notes
- `--allow-unauthenticated` in the script makes the URL **public**. Remove that flag to require
  Google sign-in.
- Region defaults to `europe-west1`; pass a different one as the 2nd arg.
- Redeploy after code changes by re-running the same command.
- First deploy takes a few minutes (image build); later ones are faster.
- Cost: tiny for a static site (scales to zero when idle; free tier usually covers light use).

## Files
- `Dockerfile` (project root) — nginx static host on $PORT.
- `deploy/default.conf.template` — nginx config (SPA fallback + correct WASM MIME).
- `.gcloudignore` — keeps node_modules/backups/research out of the build upload.
- `deploy/deploy-cloudrun.sh` — the deploy command.
