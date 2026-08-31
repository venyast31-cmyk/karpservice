# Karpservice

Production app: https://karpservice-app.jeweled-astrodon.workers.dev/

The Cloudflare edge app serves the current frontend from GitHub Pages and proxies `/api/*` to `karpservice-api`, keeping Telegram authentication on the same origin.

Frontend updates published to `main` are picked up by the edge app automatically. The backend Worker source is in `worker/`.
