require('dotenv').config();

module.exports = {
  // Slack
  slackBotToken: process.env.SLACK_BOT_TOKEN,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET,

  // Whop
  whopApiKey: process.env.WHOP_API_KEY,
  whopCompanyId: process.env.WHOP_COMPANY_ID,
  whopProductId: process.env.WHOP_PRODUCT_ID,
  whopWebhookSecret: process.env.WHOP_WEBHOOK_SECRET,

  // App
  port: process.env.PORT || 3000,
  notificationChannel: process.env.SLACK_NOTIFICATION_CHANNEL || '#sales-create-payment-link'
};
