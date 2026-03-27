const { createPaymentPlan } = require('../services/whop');

/**
 * Register view submission handlers.
 * @param {import('@slack/bolt').App} app
 */
function register(app) {

  // Handle the payment link creation modal submission
  app.view('create_payment_link_modal', async ({ ack, body, view, client }) => {
    const values = view.state.values;
    const rawAmount = values.amount_block.amount_input.value;
    const amount = parseFloat(rawAmount);

    // Validate amount before doing anything
    if (isNaN(amount) || amount <= 0) {
      await ack({
        response_action: 'errors',
        errors: {
          amount_block: 'Please enter a valid positive number, e.g. 2700 or 150.50'
        }
      });
      return;
    }

    await ack();

    const clientName = values.client_name_block.client_name_input.value;
    const clientEmail = values.client_email_block.client_email_input.value;
    const serviceName = values.service_block.service_input.value;
    const metadata = JSON.parse(view.private_metadata);
    const userId = metadata.user_id;
    const channelId = metadata.channel_id;

    try {
      const { paymentLink, paymentId } = await createPaymentPlan(
        amount,
        serviceName,
        userId,
        clientName,
        clientEmail
      );

      await client.chat.postMessage({
        channel: channelId,
        text: `💳 New Payment Link Created!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `💳 *New Payment Link Created!*`,
                ``,
                `*Client:* ${clientName}`,
                `*Email:* ${clientEmail}`,
                `*Service:* ${serviceName}`,
                `*Amount:* $${amount.toFixed(2)}`,
                `*Created by:* <@${userId}>`,
                `*Payment ID:* \`${paymentId}\``,
                ``,
                `🔗 *Link:* ${paymentLink}`
              ].join('\n')
            }
          }
        ]
      });

    } catch (error) {
      console.error('Error creating payment link:', error);
      await client.chat.postMessage({
        channel: channelId,
        text: `❌ <@${userId}> Something went wrong creating the payment link. Please try again.`
      });
    }
  });
}

module.exports = { register };
