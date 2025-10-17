# 🆔 Vaulty v120 - Complete Setup Guide

This comprehensive guide shows how to obtain and configure every ID, token, and credential required for Vaulty, the enterprise creator onboarding bot with mobile monitoring.

## Discord

### 1) DISCORD_TOKEN (Bot Token)
- Go to the Discord Developer Portal: [Applications](https://discord.com/developers/applications)
- Select your application (or create one).
- Go to "Bot" in the left sidebar.
- If no bot exists, click "Add Bot".
- Click "Reset Token" and copy the token → set it as `DISCORD_TOKEN`.

### 2) APPLICATION_ID (Application/Client ID)
- In the Developer Portal app page, under "General Information", copy "Application ID".
- Set this as `APPLICATION_ID`.

### 3) GUILD_ID (Server ID, optional for dev command registration)
- In Discord, enable Developer Mode:
  - User Settings → Advanced → toggle "Developer Mode".
- Right‑click your server icon → "Copy Server ID".
- Set this as `GUILD_ID` (optional but recommended for faster command updates).

### 4) ONBOARDING_CHANNEL_MAP (Channel IDs)
- With Developer Mode on, right‑click the target `#onboarding` channel → "Copy Channel ID".
- Map your guild ID to that channel ID in `.env`, e.g.:
  - `ONBOARDING_CHANNEL_MAP=123456789012345678:223344556677889900`

### 5) REQUIRED_ROLE_NAMES (Role Names)
- Create roles in your server (Server Settings → Roles): `Creator`, `Verified`.
- Ensure the bot’s role is above these roles in the list.
- Use exact names (case‑sensitive) or adjust `REQUIRED_ROLE_NAMES` accordingly.

### 6) GUILD_TAB_MAP (Guild IDs to Sheet Tab Names)
- Use your `GUILD_ID` and decide tab names in the spreadsheet.
- Example: `GUILD_TAB_MAP=123456789012345678:Server A Log`

### Useful Discord Docs
- Developer Portal: [Applications](https://discord.com/developers/applications)
- Bot Permissions and Intents: [Privileged Intents](https://support-dev.discord.com/hc/en-us/articles/4404772028055)
- Discord.js Guide: [Interactions (Slash Commands)](https://discordjs.guide/interactions/registering-slash-commands.html)

## Google Sheets

### 1) MASTER_SPREADSHEET_ID (Spreadsheet ID)
- Open your Google Sheet in the browser.
- The URL looks like: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit#gid=0`
- Copy the `<SPREADSHEET_ID>` part and set it as `MASTER_SPREADSHEET_ID`.

### 2) Service Account Setup
- Go to Google Cloud Console: [Console](https://console.cloud.google.com/)
- Create or select a project.
- Enable the Google Sheets API:
  - APIs & Services → Library → search "Google Sheets API" → Enable.
- Create a Service Account:
  - IAM & Admin → Service Accounts → "Create Service Account".
  - Grant minimal roles (often none required for external Sheet access).
- Create a key (JSON):
  - Service Accounts → select your SA → Keys → Add Key → Create new key → JSON.
  - Download the JSON file.

### 3) Authentication Options (Choose One)

#### Option A: Full JSON (Recommended for Heroku)
- Set `GOOGLE_CREDENTIALS_JSON` to the entire contents of your JSON file
- Example: `GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}`

#### Option B: Separate Credentials
- Set `GOOGLE_CLIENT_EMAIL` to the service account email
- Set `GOOGLE_PRIVATE_KEY` to the private key (with `\n` for line breaks)
- Example: `GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----"`

### 4) Share the Sheet with the Service Account
- Open your Google Sheet and click "Share".
- Add the service account email (looks like `service-account-name@<project-id>.iam.gserviceaccount.com`).
- Grant "Editor" access so the bot can append rows and create tabs.

### Google Docs
- Sheets API Overview: [Google Sheets API](https://developers.google.com/sheets/api)
- Service Accounts: [IAM Service Accounts](https://cloud.google.com/iam/docs/service-accounts)

## 📱 Pushover (Mobile Notifications)

### 1) PUSHOVER_APP_TOKEN (Application Token)
- Create a Pushover account at [pushover.net](https://pushover.net/)
- Go to "Your Applications" → "Create an Application"
- Fill in application details (Name: "Vaulty Bot", etc.)
- Copy the API Token/Key → set it as `PUSHOVER_APP_TOKEN`

### 2) PUSHOVER_USER_KEY (User Key)
- On your Pushover dashboard, copy your "User Key"
- Set this as `PUSHOVER_USER_KEY`

### 3) Download Mobile App
- Install Pushover app on your mobile device
- Login with your Pushover account
- Test notifications by sending a test message from the dashboard

### Pushover Docs
- Getting Started: [Pushover.net](https://pushover.net/)
- API Documentation: [Pushover API](https://pushover.net/api)

## 🎯 Environment Variables Setup

### Required Variables
| Variable | Source | Example |
|----------|--------|---------|
| `DISCORD_TOKEN` | Discord Developer Portal | `MTEx...` |
| `APPLICATION_ID` | Discord Developer Portal | `123456789012345678` |
| `MASTER_SPREADSHEET_ID` | Google Sheets URL | `1abc...` |

### Google Authentication (Choose One Method)
| Method | Variables | Notes |
|--------|-----------|-------|
| **Full JSON** | `GOOGLE_CREDENTIALS_JSON` | Entire JSON file contents |
| **Separate** | `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` | Individual credentials |

### Mobile Monitoring (Optional but Recommended)
| Variable | Source | Example |
|----------|--------|---------|
| `PUSHOVER_APP_TOKEN` | Pushover Application | `ag5j9df5tzhcbs4bwxk8aqiosqq9f3` |
| `PUSHOVER_USER_KEY` | Pushover Dashboard | `uf53v2p8r48grakxghjtps63bi999q` |

### Optional Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `GUILD_ID` | Dev command registration | Global registration |
| `LOG_LEVEL` | Logging verbosity | `info` |

## ✅ Final Deployment Checklist

### 🔐 Credentials
- [ ] `DISCORD_TOKEN` set
- [ ] `APPLICATION_ID` set
- [ ] `MASTER_SPREADSHEET_ID` set
- [ ] Google authentication configured (JSON or separate)
- [ ] Service account has Editor access to Google Sheet
- [ ] `PUSHOVER_APP_TOKEN` set (optional but recommended)
- [ ] `PUSHOVER_USER_KEY` set (optional but recommended)

### 🤖 Discord Setup
- [ ] Bot invited to server with proper permissions
- [ ] Bot role positioned above roles it manages
- [ ] Required channels created (#welcome, #audit)
- [ ] Required roles created (Onboarding, Onboarded, etc.)

### 🚀 Deployment Ready
- [ ] Code deployed to Heroku
- [ ] Environment variables configured
- [ ] Worker dyno scaled to 1
- [ ] Bot appears online in Discord

### 🧪 Testing
- [ ] `/ping` command responds
- [ ] `/server-setup` shows server type selection
- [ ] `/onboard` creates functional onboarding modal
- [ ] `/tiktok-stats` returns creator analytics
- [ ] Pushover notifications work (test onboarding to receive mobile alerts)

**Vaulty v120 is ready for enterprise deployment with mobile monitoring!** 📱🚀

*Last Updated: September 2025*

