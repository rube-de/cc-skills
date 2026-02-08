# Doppler Integrations Reference

Patterns for integrating Doppler with CI/CD, containers, cloud platforms, and infrastructure tools.

## Docker

### Inject at Runtime

```bash
# Run container with Doppler-injected secrets
doppler run -- docker run -e DATABASE_URL -e API_KEY my-app

# Docker Compose with Doppler
doppler run -- docker compose up
```

### Dockerfile Pattern

```dockerfile
# Install Doppler CLI in container
RUN apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg && \
    curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
    'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | \
    gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | \
    tee /etc/apt/sources.list.d/doppler-cli.list && \
    apt-get update && apt-get install -y doppler

# Use service token at runtime
ENTRYPOINT ["doppler", "run", "--"]
CMD ["node", "server.js"]
```

## Docker Compose

### Method 1: Wrap with `doppler run`

The simplest approach — inject secrets into the `docker compose` process itself:

```bash
# All services inherit Doppler secrets as environment variables
doppler run -- docker compose up

# With specific project/config
doppler run -p backend -c dev -- docker compose up
```

Services access secrets via `environment` in docker-compose.yml:

```yaml
services:
  app:
    build: .
    environment:
      - DATABASE_URL
      - API_KEY
      - REDIS_URL
```

### Method 2: Embed CLI in Container

Install Doppler CLI in the image and use a service token at runtime:

```yaml
services:
  app:
    build: .
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN}
    entrypoint: ["doppler", "run", "--"]
    command: ["node", "server.js"]
```

### Method 3: Dynamic Template

Use Doppler's template substitution to render a docker-compose.yml with secrets:

```bash
# 1. Create doppler-docker-compose.yml.tpl with {{.SECRET_NAME}} placeholders
# 2. Render the template
doppler secrets substitute doppler-docker-compose.yml.tpl > docker-compose.yml

# 3. Run as normal
docker compose up
```

### Method 4: Mount Secrets File

```bash
# Mount secrets as an ephemeral .env file for Docker Compose
doppler run --mount .env --mount-format env -- docker compose up
```

## GitHub Actions

### Using Service Token

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      - name: Run with secrets
        run: doppler run -- npm test
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}

      - name: Get specific secret
        run: |
          DB_URL=$(doppler secrets get DATABASE_URL --plain)
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

### Using Doppler Integration Sync

Instead of service tokens, configure a GitHub Actions sync in the Doppler dashboard to automatically push secrets to GitHub repository secrets.

## AWS

### ECS / Fargate

```bash
# Use Doppler's AWS Secrets Manager sync
# 1. Configure sync in Doppler dashboard: Integrations → AWS Secrets Manager
# 2. Reference synced secrets in task definition:
```

```json
{
  "containerDefinitions": [{
    "secrets": [{
      "name": "DATABASE_URL",
      "valueFrom": "arn:aws:secretsmanager:us-east-1:123456:secret:doppler-backend-prd"
    }]
  }]
}
```

### Lambda

```bash
# Option 1: Sync to AWS Secrets Manager, reference in Lambda config
# Option 2: Use Doppler CLI in Lambda layer
# Option 3: Sync to AWS SSM Parameter Store
```

### SSM Parameter Store

Configure via Doppler dashboard: Integrations → AWS SSM. Secrets are synced as SecureString parameters.

## GCP

### Cloud Run / Cloud Functions

```bash
# Sync to GCP Secret Manager via Doppler dashboard
# Reference in Cloud Run service:
gcloud run deploy my-service \
  --set-secrets="DATABASE_URL=doppler-db-url:latest"
```

### GKE

Use the Doppler Kubernetes Operator (see Kubernetes section below).

## Azure

### Key Vault Sync

Configure via Doppler dashboard: Integrations → Azure Key Vault. Secrets are synced as Key Vault secrets.

### App Service / Functions

Reference synced Key Vault secrets in application settings:
```
@Microsoft.KeyVault(SecretUri=https://my-vault.vault.azure.net/secrets/DATABASE-URL/)
```

## Kubernetes

### Doppler Kubernetes Operator

```bash
# Install the operator
helm repo add doppler https://helm.doppler.com
helm install doppler-operator doppler/doppler-operator

# Create a DopplerSecret resource
```

```yaml
apiVersion: secrets.doppler.com/v1alpha1
kind: DopplerSecret
metadata:
  name: my-app-secrets
spec:
  tokenSecret:
    name: doppler-token
  managedSecret:
    name: my-app-env
    type: Opaque
  resyncOnChange: true
```

```yaml
# Reference in deployment
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          envFrom:
            - secretRef:
                name: my-app-env
```

## Terraform

### Doppler Terraform Provider

```hcl
terraform {
  required_providers {
    doppler = {
      source  = "DopplerHQ/doppler"
      version = "~> 1.0"
    }
  }
}

provider "doppler" {
  # Uses DOPPLER_TOKEN env var or explicit token
  doppler_token = var.doppler_token
}

# Read secrets
data "doppler_secrets" "this" {
  project = "backend"
  config  = "prd"
}

# Use individual secrets
output "db_url" {
  value     = data.doppler_secrets.this.map.DATABASE_URL
  sensitive = true
}
```

## Cloudflare

### Cloudflare Pages

Native sync via Doppler dashboard: Integrations → Cloudflare Pages.

1. Create a Cloudflare API token with `Cloudflare Pages:Edit` permission
2. In Doppler dashboard: Integrations → Add → Cloudflare Pages
3. Select the Cloudflare account, Pages project, and environment (production / preview)
4. Choose the Doppler config to sync from
5. Secrets are immediately and continuously synced to Cloudflare Pages environment variables

### Cloudflare Workers

Native sync via Doppler dashboard: Integrations → Cloudflare Workers.

1. Create a Cloudflare API token with `Workers Scripts:Edit` permission
2. In Doppler dashboard: Integrations → Add → Cloudflare Workers
3. Select the Cloudflare account and Worker
4. Choose the Doppler config to sync from
5. Secrets are synced as Worker secrets (encrypted environment variables)

### CI/CD Alternative (wrangler)

```bash
# Use doppler run to inject secrets, then deploy with wrangler
doppler run -- npx wrangler pages deploy ./dist

# Or set individual secrets via wrangler
doppler secrets download --format json --no-file | \
  npx wrangler pages secret bulk --project-name my-pages-project
```

## Vercel

Configure via Doppler dashboard: Integrations → Vercel. Secrets are synced to Vercel environment variables per environment (production, preview, development).

## Firebase

### Firebase Functions — Local Development

Doppler replaces `.runtimeconfig.json` and `.env` files for local development:

```bash
# Inject secrets via CLOUD_RUNTIME_CONFIG for Firebase Functions emulator
doppler run -- firebase emulators:start

# Or run functions locally
doppler run -- firebase serve --only functions
```

### Firebase Functions — Deployment

```bash
# Option 1: Inject secrets at deploy time
doppler run -- firebase deploy --only functions

# Option 2: Sync secrets to Firebase Functions config
# Create a sync script (e.g., scripts/secrets-sync.sh):
doppler secrets download --format json --no-file | \
  node -e "
    const secrets = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const args = Object.entries(secrets).map(([k,v]) => k.toLowerCase() + '=' + v).join(' ');
    console.log(args);
  " | xargs firebase functions:config:set

# Then deploy
firebase deploy --only functions
```

### Firebase Functions — CI/CD

```yaml
# GitHub Actions example
- name: Install Doppler CLI
  uses: dopplerhq/cli-action@v3

- name: Deploy Firebase Functions
  run: doppler run -- firebase deploy --only functions
  env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

### Firebase Hosting

```bash
# Inject build-time secrets for static site generation
doppler run -- npm run build
firebase deploy --only hosting

# Or wrap the entire flow
doppler run -- sh -c 'npm run build && firebase deploy --only hosting'
```

## Heroku

Configure via Doppler dashboard: Integrations → Heroku. Secrets are synced as Heroku config vars.

## Serverless Framework

Doppler has native variable support built into the Serverless Framework.

### Built-in Variable Resolver

```yaml
# serverless.yml — use ${doppler:SECRET_NAME} syntax
provider:
  name: aws
  environment:
    DATABASE_URL: ${doppler:DATABASE_URL}
    API_KEY: ${doppler:API_KEY}
```

Requires `DOPPLER_TOKEN` set in the environment or Doppler CLI configured for the project.

### CLI Wrapper Approach

```bash
# Inject all secrets as env vars, then deploy
doppler run -- serverless deploy

# With specific stage
doppler run -c production -- serverless deploy --stage production
```

### Template Substitution

```bash
# Create serverless.yml.tpl with placeholders
# Render with current secrets, then deploy
doppler secrets substitute serverless.yml.tpl > serverless.yml
serverless deploy
```

## Webapp.io

Doppler integrates with [Webapp.io](https://webapp.io) for CI/CD secret injection.

### Setup

1. Create a custom environment in Doppler (e.g., "webapp-io") since it doesn't map to dev/staging/production
2. Generate a Doppler Service Token for that config
3. Add `DOPPLER_TOKEN` as a secret in Webapp.io (project-wide or per-project)

### Usage in Layerfiles

```
# Layerfile
FROM vm/ubuntu:20.04

# Install Doppler CLI
RUN curl -sLf --retry 3 --tlsv1.2 --proto "=https" https://get.doppler.com | sh

# Load the token from Webapp.io secrets
SECRET ENV DOPPLER_TOKEN

# Run commands with secrets injected
RUN doppler run -- npm test
RUN doppler run -- npm run build
```

## CI/CD General Pattern

For any CI/CD system:

1. **Create a service token** scoped to the project and config (e.g., `backend` / `ci`)
2. **Store the token** as a CI secret (e.g., `DOPPLER_TOKEN`)
3. **Install the CLI** in your CI job
4. **Use `doppler run`** to inject secrets

```bash
# Generic CI script
curl -sLf --retry 3 --tlsv1.2 --proto "=https" https://get.doppler.com | sh
doppler run -- your-test-command
doppler run -- your-deploy-command
```

## Secrets Referencing (Cross-Project)

Share secrets across projects without duplication:

1. In the Doppler dashboard, set a secret's value to reference another project:
   ```
   ${projects.shared-infra.configs.prd.DATABASE_URL}
   ```
2. The referenced value resolves at access time
3. Changes to the source automatically propagate

## Name Transformers

When injecting secrets, transform names to match your application's convention:

```bash
# Original: DATABASE_URL
doppler run --name-transformer upper-camel -- app   # DatabaseUrl
doppler run --name-transformer camel -- app          # databaseUrl
doppler run --name-transformer lower-kebab -- app    # database-url
doppler run --name-transformer lower-snake -- app    # database_url
doppler run --name-transformer tf-var -- app         # TF_VAR_database_url
doppler run --name-transformer dotnet-env -- app     # Database__Url
```
