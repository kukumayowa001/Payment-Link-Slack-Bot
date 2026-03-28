// ============================================================
// WHOP PAYMENT LINK BOT — Main Application File
// ============================================================

const { App, ExpressReceiver } = require('@slack/bolt');
const Whop = require('@whop/sdk').default;
const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

// 1. Initialize Express App
const expressApp = express();

// 2. Initialize ExpressReceiver (Standard Bolt Setup)
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

const whop = new Whop({ apiKey: process.env.WHOP_API_KEY });

// ============================================================
// STEP 1: Listen for /create-whop-payment-link slash command
//         → Open a modal form
// ============================================================
app.command('/create-whop-payment-link', async ({ ack, body, client }) => {
  await ack();
  console.log('📥 Received /create-whop-payment-link command from user:', body.user_id);

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'create_payment_link_modal',
        private_metadata: JSON.stringify({
          user_id: body.user_id,
          channel_id: body.channel_id || process.env.SLACK_CHANNEL_ID
        }),
        title: {
          type: 'plain_text',
          text: 'Create Payment Link',
          emoji: true
        },
        submit: {
          type: 'plain_text',
          text: 'Create Link',
          emoji: true
        },
        close: {
          type: 'plain_text',
          text: 'Cancel',
          emoji: true
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Fill out the details below to generate a Whop Checkout session.'
            }
          },
          {
            type: 'input',
            block_id: 'client_name_block',
            label: { type: 'plain_text', text: 'Client Name' },
            element: {
              type: 'plain_text_input',
              action_id: 'client_name_input',
              placeholder: { type: 'plain_text', text: 'e.g. Richard Rosen' }
            }
          },
          {
            type: 'input',
            block_id: 'client_email_block',
            label: { type: 'plain_text', text: 'Client Email' },
            element: {
              type: 'plain_text_input',
              action_id: 'client_email_input',
              placeholder: { type: 'plain_text', text: 'e.g. client@email.com' }
            }
          },
          {
            type: 'input',
            block_id: 'service_name_block',
            label: { type: 'plain_text', text: 'Service / Product Name' },
            element: {
              type: 'plain_text_input',
              action_id: 'service_name_input',
              placeholder: { type: 'plain_text', text: 'e.g. Website Design Package' }
            }
          },
          {
            type: 'input',
            block_id: 'amount_block',
            label: { type: 'plain_text', text: 'Amount (USD — numbers only)' },
            element: {
              type: 'plain_text_input',
              action_id: 'amount_input',
              placeholder: { type: 'plain_text', text: 'e.g. 2700 or 150.50' }
            }
          }
        ]
      }
    });
    console.log('✅ Modal opened successfully');
  } catch (error) {
    console.error('❌ Error opening modal:', error);
    try {
      await client.chat.postEphemeral({
        channel: body.channel_id || process.env.SLACK_CHANNEL_ID,
        user: body.user_id,
        text: `❌ Error opening modal: ${error.message}`
      });
    } catch (e) {
      console.error('Could not send error message', e);
    }
  }
});

// ============================================================
// STEP 2: Handle modal form submission
//         → Create Whop Plan (payment link)
//         → Post the link to Slack
// ============================================================
app.view('create_payment_link_modal', async ({ ack, view, client }) => {
  console.log('📥 Received modal submission');

  const values = view.state.values;
  const clientName = values.client_name_block.client_name_input.value;
  const clientEmail = values.client_email_block.client_email_input.value;
  const serviceName = values.service_name_block.service_name_input.value;
  const amountRaw = values.amount_block.amount_input.value;

  const metadata = JSON.parse(view.private_metadata);
  const userId = metadata.user_id;
  const channelId = metadata.channel_id;

  // Validate amount
  const amountNum = parseFloat(amountRaw);
  if (isNaN(amountNum) || amountNum <= 0) {
    await ack({
      response_action: 'errors',
      errors: {
        amount_block: 'Please enter a valid number greater than 0.'
      }
    });
    return;
  }

  await ack();

  console.log(`💰 Creating payment link: ${serviceName} - $${amountNum.toFixed(2)} for ${clientName}`);

  // Send a loading message
  let loadingMsg;
  try {
    loadingMsg = await client.chat.postMessage({
      channel: channelId,
      text: `⏳ <@${userId}> is creating a payment link for *${clientName}*...`
    });
  } catch (e) {
    console.error('Warning: Could not post loading message:', e.message);
  }

  try {
    // Create Whop Plan (payment link)
    const plan = await whop.plans.create({
      company_id: process.env.WHOP_COMPANY_ID,
      access_pass_id: process.env.WHOP_PRODUCT_ID,
      initial_price: amountNum,
      plan_type: 'one_time',
      title: `${serviceName} for ${clientName}`.substring(0, 30),
      // Whop SDK doesn't natively support the metadata parameter on this endpoint
      // So we store all our tracking data as JSON inside internal_notes
      internal_notes: JSON.stringify({
        sl: userId,
        sv: serviceName.substring(0, 60),
        cl: clientName.substring(0, 60),
        em: clientEmail.substring(0, 50),
        ch: channelId
      })
    });

    const paymentUrl = plan.purchase_url;
    const paymentId = plan.id;

    console.log('✅ Whop Plan created:', paymentId);

    // Replace the loading message with the actual payment link
    if (loadingMsg && loadingMsg.ts) {
      await client.chat.delete({
        channel: channelId,
        ts: loadingMsg.ts
      });
    }

    await client.chat.postMessage({
      channel: channelId,
      text: `✅ Payment Link Created for ${clientName}!`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '✅ Payment Link Created!',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `*Created by:* <@${userId}>`,
              `*Client:* ${clientName} (${clientEmail})`,
              `*Service:* ${serviceName}`,
              `*Amount:* $${amountNum.toFixed(2)}`
            ].join('\n')
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🔗 Payment URL:*\n${paymentUrl}`
          }
        }
      ]
    });

    console.log('✅ Payment link posted to Slack channel:', channelId);

  } catch (error) {
    console.error('❌ Error creating payment link:', error);

    if (loadingMsg && loadingMsg.ts) {
      await client.chat.update({
        channel: channelId,
        ts: loadingMsg.ts,
        text: `❌ <@${userId}> Something went wrong creating your payment link. Error: ${error.message}`
      });
    } else {
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ <@${userId}> Something went wrong creating your payment link. Error: ${error.message}`
      });
    }
  }
});

// ============================================================
// STEP 3: Whop Webhook — When a client pays
// ============================================================

// Debug middleware to log ALL incoming requests
expressApp.use((req, res, next) => {
  if (req.path === '/slack/events') {
    console.log(`🔌 [Slack Request] ${req.method} ${req.path}`);
  } else {
    console.log(`🔌 [Express] ${req.method} ${req.path}`);
  }
  next();
});

// --- Bolt Routes ---
// This handles all Slash Commands, Interactivity, and Events at /slack/events
expressApp.use(receiver.router);

expressApp.get('/whop/webhook', (req, res) => {
  res.send('Ready to receive Whop Webhooks at this URL (POST)!');
});

expressApp.post('/whop/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verify webhook signature
  const sig = req.headers['x-whop-signature'];
  const secret = process.env.WHOP_WEBHOOK_SECRET;

  if (secret && sig) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');

    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      console.error('❌ Webhook verification failed: invalid signature');
      return res.status(401).send('Unauthorized');
    }
  }

  try {
    let body;
    if (Buffer.isBuffer(req.body)) {
      body = JSON.parse(req.body.toString());
    } else if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      body = JSON.parse(req.body);
    }

    const eventType = body.type || body.action; // Whop uses 'type', some older versions use 'action'
    console.log(`📥 Webhook Received! Event Type: "${eventType}"`);
    console.log('📦 Full Body (Keys):', Object.keys(body).join(', '));

    // Handle both "payment.succeeded" and "payment_succeeded"
    if (eventType === 'payment.succeeded' || eventType === 'payment_succeeded') {
      const payment = body.data || {};
      const planId = payment.plan_id;
      const paymentId = payment.id || 'test_id';
      const amountPaid = payment.final_amount ? (payment.final_amount / 100).toFixed(2) : '0.00';
      
      console.log(`💰 Payment event detected! Plan: ${planId}, Amount: ${amountPaid}`);
      console.log('🚀 Progress: Event validated, moving to Plan retrieval...');

      // Retrieve plan details (Safely)
      let planDetails = {};
      const isMockPlan = !planId || (typeof planId === 'string' && planId.startsWith('plan_test'));

      if (planId && !isMockPlan) {
        try {
          planDetails = await whop.plans.retrieve(planId);
          console.log('📄 Plan details retrieved from Whop');
        } catch (retrieveError) {
          console.warn(`⚠️ Could not retrieve plan ${planId} (likely a test/mock ID):`, retrieveError.message);
        }
      } else {
        console.log('🧪 Skipping plan retrieval for test/missing ID');
      }
      
      let parsedNotes = {};
      try {
        if (planDetails && planDetails.internal_notes) {
          parsedNotes = JSON.parse(planDetails.internal_notes);
          console.log('📝 Parsed internal notes:', JSON.stringify(parsedNotes));
        }
      } catch (e) {
        console.warn('❌ Could not parse internal notes as JSON:', e.message);
      }
      
      // Extract Slack User ID from internal_notes
      const slackUserId = parsedNotes.sl;
      const clientName = parsedNotes.cl || 'Test Client';
      const clientEmail = parsedNotes.em || 'test@example.com';
      const serviceName = parsedNotes.sv || 'Test Service';
      const slackChannel = parsedNotes.ch || process.env.SLACK_NOTIFICATION_CHANNEL || '#create-payment-link';

      console.log(`📣 Preparation for Slack Message: Channel=${slackChannel}, UserID=${slackUserId || 'MISSING (Fallback used)'}`);
      console.log('🚀 Progress: Reached Slack Notification Block');

      try {
        const { WebClient } = require('@slack/web-api');
        const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

        await slackClient.chat.postMessage({
          channel: slackChannel,
          text: `💰 Payment Received! (${slackUserId ? 'Real' : 'Test/Manual'})`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: slackUserId ? '💰 PAYMENT RECEIVED! 🎉' : '🧪 TEST WEBHOOK SUCCESSFUL! 🔬',
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  slackUserId ? `✅ *Payment Received!* <@${slackUserId}>, your client just paid!` : `_This is a test notification from Whop to verify your connection._`,
                  ``,
                  `*Client:* ${clientName}${clientEmail ? ` (${clientEmail})` : ''}`,
                  `*Service:* ${serviceName}`,
                  `*Amount Paid:* $${amountPaid}`,
                  `*Payment ID:* \`${paymentId}\``,
                  `*Whop Plan ID:* \`${planId}\``
                ].join('\n')
              }
            }
          ]
        });
        console.log('✅ Payment confirmation posted to Slack!');
      } catch (slackError) {
        console.error('❌ Error posting to Slack:', slackError.message);
        // We don't throw here, so the webhook still returns 200 to Whop
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('❌ FATAL Webhook error:', err.message);
    console.error(err.stack);
    res.status(500).send(`Internal Server Error: ${err.message}`);
  }
});

expressApp.get('/', (req, res) => {
  res.send('Whop Payment Link Bot is running!');
});

// ============================================================
// START THE SERVER
// ============================================================
(async () => {
  try {
    const PORT = process.env.PORT || 3000;

    // Start Express server
    expressApp.listen(PORT, '0.0.0.0', () => {
      console.log(`⚡ Bot & Webhooks listening on port ${PORT}`);
      console.log(`🔗 Slack Endpoint: /slack/events`);
      console.log(`🔗 Whop Webhook: /whop/webhook`);
    });

    console.log('✅ Payment Link Bot is fully operational!');

    // --- Slack Health Check ---
    try {
      const auth = await app.client.auth.test();
      console.log(`🤖 Slack Identity: @${auth.user} (${auth.team})`);
      console.log('✅ Slack Token is VALID and authenticated.');
    } catch (authError) {
      console.error('❌ Slack Token Health Check FAILED:', authError.message);
      console.error('⚠️ Please check your SLACK_BOT_TOKEN in Railway variables.');
    }
  } catch (error) {
    console.error('❌ Failed to start the bot:', error);
  }
})();
