const express = require('express');
const crypto = require('crypto');
const { getPlanDetails } = require('../services/whop');
const config = require('../config');

/**
 * Verify that the webhook request genuinely came from Whop.
 * Whop signs payloads using HMAC-SHA256 with your webhook secret.
 */
function verifyWhopSignature(rawBody, signatureHeader) {
  if (!config.whopWebhookSecret) return true; // Skip if not configured
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', config.whopWebhookSecret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected)
  );
}

/**
 * Register the Whop webhook route on the Bolt receiver.
 * @param {import('@slack/bolt').App} app
 */
function register(app) {
  const webhookRouter = express.Router();

  // Whop sends a POST here when a payment event occurs
  // Reference: https://docs.whop.com/developer/guides/webhooks
  webhookRouter.post('/whop/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const rawBody = req.body;
      const signature = req.headers['x-whop-signature'];

      // Reject requests that fail signature verification
      if (!verifyWhopSignature(rawBody, signature)) {
        console.warn('⚠️ Webhook rejected: invalid signature');
        return res.status(401).send('Unauthorized');
      }

      const body = JSON.parse(rawBody.toString());

      if (body.action === 'payment.succeeded') {
        const payment = body.data;
        const planId = payment.plan_id;
        const paymentId = payment.id;
        const amountPaid = payment.final_amount / 100; // cents → dollars

        // Retrieve which Slack user created this plan (stored in metadata)
        const planDetails = await getPlanDetails(planId);
        const creatorSlackUserId = planDetails.metadata?.creator_slack_id;
        const serviceName = planDetails.metadata?.service_name || 'Service';
        const customerName = planDetails.metadata?.client_name || planDetails.metadata?.customer_name || 'the client';

        if (creatorSlackUserId) {
          await app.client.chat.postMessage({
            channel: config.notificationChannel,
            text: `✅ Payment Received!`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: [
                    `✅ *Payment Received!*`,
                    ``,
                    `*Customer:* ${customerName}`,
                    `*Service:* ${serviceName}`,
                    `*Amount Paid:* $${amountPaid.toFixed(2)}`,
                    `*Payment ID:* \`${paymentId}\``,
                    `*Whop Plan ID:* \`${planId}\``,
                    ``,
                    `🎉 Great work <@${creatorSlackUserId}>! Your client just paid!`
                  ].join('\n')
                }
              }
            ]
          });
        }
      }

      res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(500).send('Error');
    }
  });

  // Attach webhook router to the Bolt app's underlying Express instance (Bolt v4)
  app.receiver.app.use(webhookRouter);
}

module.exports = { register };
