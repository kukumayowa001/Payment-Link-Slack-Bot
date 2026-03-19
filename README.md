# Whop Payment Link Bot

A Slack bot that lets sales reps instantly generate Whop payment links via a slash command, and notifies the team when a client pays.

## How It Works

1. A rep types `/create-payment-link` in any Slack channel
2. A popup form appears — they fill in the customer name, amount, service name, and optional notes
3. The bot creates a Whop payment plan and posts the link back to the channel
4. When the client pays, Whop fires a webhook and the bot posts a "✅ Payment Received!" confirmation

## Project Structure

```
payment-link-bot/
├── app.js              ← entry point
├── config.js           ← all environment variables
├── services/
│   └── whop.js         ← Whop SDK helpers
├── handlers/
│   ├── commands.js     ← /create-payment-link slash command
│   ├── views.js        ← modal form submission
│   └── webhooks.js     ← Whop payment webhook
├── package.json
└── .env                ← secrets (never commit this)
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the variables below into a `.env` file in the project root:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

WHOP_API_KEY=...
WHOP_COMPANY_ID=biz_...
WHOP_PRODUCT_ID=prod_...
WHOP_WEBHOOK_SECRET=...

SLACK_NOTIFICATION_CHANNEL=#sales-create-payment-link
PORT=3000
```

| Variable | Where to find it |
|----------|-----------------|
| `SLACK_BOT_TOKEN` | Slack App → OAuth & Permissions |
| `SLACK_SIGNING_SECRET` | Slack App → Basic Information |
| `WHOP_API_KEY` | Whop Dashboard → Settings → API Keys |
| `WHOP_COMPANY_ID` | Whop Dashboard → Settings → Company ID |
| `WHOP_PRODUCT_ID` | Whop Dashboard → your product page |
| `WHOP_WEBHOOK_SECRET` | Whop Dashboard → Webhooks → your endpoint |
| `SLACK_NOTIFICATION_CHANNEL` | The Slack channel name to post payment confirmations |

### 3. Configure Slack App

In your Slack App settings:

- **Slash Commands** → Add `/create-payment-link` pointing to `https://your-domain.com/slack/events`
- **Interactivity & Shortcuts** → Enable, set Request URL to `https://your-domain.com/slack/events`
- **OAuth Scopes** → Add: `chat:write`, `commands`

### 4. Configure Whop Webhook

In Whop Dashboard → Webhooks, add your endpoint:

```
https://your-domain.com/whop/webhook
```

Subscribe to the `payment.succeeded` event.

### 5. Run the bot

```bash
npm start
```

## Deployment (Railway)

1. Push this repo to GitHub
2. Create a new Railway project → deploy from GitHub
3. Add all environment variables in Railway → Variables tab
4. Railway automatically assigns a public URL — use that for your Slack and Whop webhook URLs
