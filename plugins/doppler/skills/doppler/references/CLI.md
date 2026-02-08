# Doppler CLI Reference

Complete command reference for the Doppler CLI.

## Authentication

```bash
# Login (opens browser)
doppler login

# Logout
doppler logout

# Check current identity
doppler me

# MFA commands
doppler mfa
```

## Setup & Configuration

```bash
# Interactive project setup (scoped to current directory)
doppler setup

# Non-interactive setup
doppler setup --project <project> --config <config> --no-interactive

# View active configuration
doppler configure debug

# View all saved config options
doppler configure --all

# Get a specific config value
doppler configure get token
doppler configure get project

# Set a config value (scoped to directory)
doppler configure set project my-project
doppler configure set config dev

# Unset a config value
doppler configure unset project

# Reset all configuration
doppler configure reset

# View config options reference
doppler configure options
```

### Scoping

Configuration is scoped by directory. The `--scope` flag controls which directory a setting applies to:

```bash
# Set config for a specific directory
doppler configure set project backend --scope /path/to/backend
doppler configure set config dev --scope /path/to/backend

# Default scope is current directory
doppler setup  # Scoped to .
```

## Projects

```bash
# List all projects
doppler projects
doppler projects --json

# Get project info
doppler projects get <project-name>

# Create a project
doppler projects create <project-name>
doppler projects create <project-name> --description "My project"

# Update project description
doppler projects update <project-name> --description "Updated desc"
doppler projects update <project-name> --name new-name

# Delete a project
doppler projects delete <project-name> --yes
```

## Environments

```bash
# List environments for a project
doppler environments -p <project>
doppler environments -p <project> --json

# Get environment info
doppler environments get <env-slug> -p <project>

# Create an environment
doppler environments create <name> -p <project> --slug <slug>

# Rename an environment
doppler environments rename <env-slug> --name <new-name> -p <project>

# Delete an environment
doppler environments delete <env-slug> -p <project> --yes
```

## Configs

```bash
# List configs for a project
doppler configs -p <project>
doppler configs -p <project> --json

# Filter by environment
doppler configs -p <project> -e development

# Get config info
doppler configs get <config-name> -p <project>

# Create a branch config
doppler configs create -p <project> -e <environment> --name <config-name>

# Clone a config
doppler configs clone -p <project> -c <source-config> --name <new-name>

# Lock a config (prevent modifications)
doppler configs lock <config-name> -p <project> --yes

# Unlock a config
doppler configs unlock <config-name> -p <project> --yes

# Delete a config
doppler configs delete <config-name> -p <project> --yes

# View config audit logs
doppler configs logs -p <project> -c <config>

# List config service tokens
doppler configs tokens -p <project> -c <config>
```

## Secrets

### Listing & Reading

```bash
# List all secrets (names + values)
doppler secrets
doppler secrets -p <project> -c <config>

# List secret names only (safe for logs)
doppler secrets --only-names

# Get specific secret(s)
doppler secrets get SECRET_NAME
doppler secrets get SECRET_NAME OTHER_SECRET -p <project> -c <config>

# Get raw value (no processing of variable references)
doppler secrets get SECRET_NAME --raw

# Output as JSON
doppler secrets --json

# Include secret type and visibility info
doppler secrets --type --visibility
```

### Setting & Deleting

```bash
# Set a single secret
doppler secrets set KEY=value
doppler secrets set KEY=value -p <project> -c <config>

# Set multiple secrets
doppler secrets set KEY1=val1 KEY2=val2 KEY3=val3

# Delete secrets
doppler secrets delete SECRET_NAME
doppler secrets delete SECRET1 SECRET2 SECRET3

# Upload secrets from a file
doppler secrets upload secrets.env
doppler secrets upload secrets.json
```

### Downloading & Exporting

```bash
# Download as env file
doppler secrets download --format env --no-file

# Download as JSON
doppler secrets download --format json --no-file

# Download to a file
doppler secrets download --format env > .env

# Substitute secrets into a template
doppler secrets substitute template.yml > output.yml
```

### Secret Notes

```bash
# Set a note on a secret
doppler secrets notes set SECRET_NAME --note "This is used for..."

# Get a secret's note
doppler secrets notes get SECRET_NAME
```

## Running Commands with Secrets

```bash
# Basic injection
doppler run -- <command> [args...]

# Examples
doppler run -- node server.js
doppler run -- python manage.py runserver
doppler run -- docker compose up -d
doppler run -- terraform plan

# With specific project/config
doppler run -p backend -c staging -- npm test

# Run a shell command string
doppler run --command "echo $SECRET_NAME && npm start"

# Only inject specific secrets
doppler run --only-secrets DATABASE_URL,API_KEY -- node server.js

# Transform secret names
doppler run --name-transformer lower-snake -- your-command
# Transformers: upper-camel, camel, lower-kebab, lower-snake, tf-var, dotnet-env

# Watch for secret changes and auto-restart (BETA)
doppler run --watch -- node server.js
```

### Mount Secrets to File

```bash
# Mount as JSON (default)
doppler run --mount secrets.json -- cat secrets.json

# Mount as .env file
doppler run --mount .env --mount-format env -- your-command

# Mount as dotnet JSON
doppler run --mount appsettings.json --mount-format dotnet-json -- dotnet run

# Mount with template
doppler run --mount config.yaml --mount-template template.yaml -- your-command

# Limit number of reads
doppler run --mount secrets.json --mount-max-reads 1 -- your-command

# Access path via DOPPLER_CLI_SECRETS_PATH env var
doppler run --mount auto -- sh -c 'cat $DOPPLER_CLI_SECRETS_PATH'
```

### Fallback & Resilience

```bash
# Enable fallback file (encrypted, auto-updated)
doppler run --fallback ./fallback.encrypted -- npm start

# Read-only fallback
doppler run --fallback ./fallback.encrypted --fallback-readonly -- npm start

# Offline mode (read from fallback only)
doppler run --fallback-only --fallback ./fallback.encrypted -- npm start

# Custom passphrase for fallback encryption
doppler run --fallback ./fb.enc --passphrase "my-passphrase" -- npm start

# Disable fallback entirely
doppler run --no-fallback -- npm start

# Clean old fallback files
doppler run clean
doppler run clean --max-age 24h
```

### Environment Precedence

```bash
# Preserve existing env var values over Doppler secrets
doppler run --preserve-env="DATABASE_URL,API_KEY" -- npm start

# Preserve ALL existing env vars (use with caution)
doppler run --preserve-env=true -- npm start
```

## Activity & Audit

```bash
# View workplace activity logs
doppler activity
doppler activity --json
doppler activity -n 50  # Show 50 entries

# Get a specific activity log entry
doppler activity get <log-id>
```

## Import

```bash
# Import projects from a YAML format
doppler import <file>
```

## Utility Commands

```bash
# Open Doppler dashboard in browser
doppler open

# View CLI changelog
doppler changelog

# Update the CLI
doppler update

# Check CLI version
doppler --version

# Enable shell completions
doppler completion bash > /etc/bash_completion.d/doppler
doppler completion zsh > "${fpath[1]}/_doppler"
doppler completion fish > ~/.config/fish/completions/doppler.fish
```

## Global Flags

These flags work with any command:

| Flag | Description |
|------|-------------|
| `--json` | Output in JSON format |
| `--silent` | Suppress info messages |
| `--debug` | Show debug output |
| `-t, --token` | Use a specific Doppler token |
| `--scope` | Directory scope for config (default `.`) |
| `--config-dir` | Config directory (default `~/.doppler`) |
| `--no-check-version` | Skip update checks |
| `--no-timeout` | Disable HTTP timeout |
| `--timeout` | HTTP request timeout (default 10s) |
| `--attempts` | HTTP retry attempts (default 5) |
| `--print-config` | Show active configuration |

## OIDC

```bash
# OIDC commands for identity-based authentication
doppler oidc
```

## Flags (Feature Flags)

```bash
# View current feature flags
doppler flags
```
