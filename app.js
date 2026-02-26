// ============================================================
// PAYMENT LINK BOT — Main Application File (Slash Commands)
// ============================================================

const { App, ExpressReceiver } = require('@slack/bolt');
const Stripe = require('stripe');
const express = require('express');
require('dotenv').config();

// --- Detect Socket Mode (local) vs HTTP (production) ---
const isSocketMode = !!process.env.SLACK_APP_TOKEN;

// 1. Initialize ExpressReceiver for production (HTTP) mode
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const appConfig = {
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
};

if (isSocketMode) {
  appConfig.socketMode = true;
  appConfig.appToken = process.env.SLACK_APP_TOKEN;
  console.log('🔌 Running in Socket Mode (local development)');
} else {
  appConfig.socketMode = false;
  appConfig.receiver = receiver;
  console.log('🌐 Running in HTTP mode (production)');
}

const app = new App(appConfig);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================================
// STEP 1: Listen for /create-payment-link slash command
//         → Open a modal form
// ============================================================
app.command('/create-payment-link', async ({ ack, body, client, logger }) => {
  // 1. Acknowledge the command IMMEDIATELY to prevent "dispatch_failed" / "expired_trigger_id"
  await ack();
  console.log('📥 Received /create-payment-link command from user:', body.user_id);

  // 2. Open the modal asynchronously
  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'create_payment_link_modal',
        // Store who ran the command and in which channel
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
              text: 'Fill out the details below to generate a Stripe Checkout session.'
            }
          },
          {
            type: 'input',
            block_id: 'client_name_block',
            label: {
              type: 'plain_text',
              text: 'Client Name'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'client_name_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g. Richard Rosen'
              }
            }
          },
          {
            type: 'input',
            block_id: 'client_email_block',
            label: {
              type: 'plain_text',
              text: 'Client Email'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'client_email_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g. client@email.com'
              }
            }
          },
          {
            type: 'input',
            block_id: 'service_name_block',
            label: {
              type: 'plain_text',
              text: 'Service / Product Name'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'service_name_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g. Website Design Package'
              }
            }
          },
          {
            type: 'input',
            block_id: 'amount_block',
            label: {
              type: 'plain_text',
              text: 'Amount (USD — numbers only)'
            },
            element: {
              type: 'plain_text_input',
              action_id: 'amount_input',
              placeholder: {
                type: 'plain_text',
                text: 'e.g. 2700 or 150.50'
              }
            }
          }
        ]
      }
    });
    console.log('✅ Modal opened successfully');
  } catch (error) {
    console.error('❌ Error opening modal:', error);
    // Let the user know if opening the modal failed
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
//         → Create Stripe Checkout Session
//         → Post the link to Slack
// ============================================================
app.view('create_payment_link_modal', async ({ ack, view, client, logger }) => {
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
    // Return an error back to the modal
    await ack({
      response_action: 'errors',
      errors: {
        'amount_block': 'Please enter a valid number greater than 0.'
      }
    });
    return;
  }

  // Tell Slack the modal was successfully parsed
  await ack();

  const amountCents = Math.round(amountNum * 100);
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
    // Create Stripe Checkout Session (supports dynamic price_data)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: serviceName,
            }
          },
          quantity: 1
        }
      ],
      metadata: {
        created_by_slack_user: userId,
        client_name: clientName,
        client_email: clientEmail,
        slack_channel: channelId
      },
      customer_email: clientEmail,
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    });

    console.log('✅ Stripe session created:', session.id);

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
            text: `*🔗 Payment URL:*\n${session.url}`
          }
        }
      ]
    });

    console.log('✅ Payment link posted to Slack channel:', channelId);

  } catch (error) {
    console.error('❌ Error creating payment link:', error);

    // Notify user of error
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
// STEP 3: Stripe Webhook — When a client pays
// ============================================================
// We use Bolt's built-in Express router in production allowing both Slack endpoints 
// and Stripe webhooks to share a single port (which Railway requires).
const expressApp = isSocketMode ? express() : receiver.router;

expressApp.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('📥 Stripe webhook received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const slackUserId = session.metadata?.created_by_slack_user;
    const clientName = session.metadata?.client_name;
    const clientEmail = session.metadata?.client_email;
    const slackChannel = session.metadata?.slack_channel || process.env.SLACK_CHANNEL_ID;
    const amountPaid = (session.amount_total / 100).toFixed(2);

    if (slackUserId && slackChannel) {
      try {
        const { WebClient } = require('@slack/web-api');
        const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

        await slackClient.chat.postMessage({
          channel: slackChannel,
          text: `💰 Payment Received from ${clientName}!`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '💰 PAYMENT RECEIVED! 🎉',
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `<@${slackUserId}> — your client just paid!`,
                  ``,
                  `*Client:* ${clientName} (${clientEmail})`,
                  `*Amount Paid:* $${amountPaid}`,
                  `*Session ID:* \`${session.payment_intent}\``
                ].join('\n')
              }
            }
          ]
        });
        console.log('✅ Payment confirmation posted to Slack!');
      } catch (slackErr) {
        console.error('❌ Error posting payment confirmation to Slack:', slackErr);
      }
    }
  }

  res.json({ received: true });
});

expressApp.get('/', (req, res) => {
  res.send('Payment Link Bot is running!');
});

// ============================================================
// START THE SERVER
// ============================================================
(async () => {
  try {
    const PORT = process.env.PORT || 3000;

    // Bolt's app.start() takes the port for HTTP mode
    if (isSocketMode) {
      await app.start();
      console.log('⚡ Slack bot connected via Socket Mode!');
      // Explicitly start our fallback Express server for local Stripe Webhooks
      expressApp.listen(PORT, () => {
        console.log(`💳 Stripe webhook listener on port ${PORT}`);
      });
    } else {
      // In HTTP mode with a custom receiver, app.start takes the port
      await app.start(PORT);
      console.log(`⚡ Slack bot & 💳 Stripe webhook listening on port ${PORT} via HTTP mode!`);
    }

    console.log('✅ Payment Link Bot is running!');
  } catch (error) {
    console.error('❌ Failed to start the bot:', error);
  }
})();
