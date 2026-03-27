/**
 * Register slash command handlers.
 * @param {import('@slack/bolt').App} app
 */
function register(app) {

  // /create-whop-payment-link — Opens the payment link creation form
  app.command('/create-whop-payment-link', async ({ ack, body, client }) => {
    await ack();

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'create_payment_link_modal',
        title: { type: 'plain_text', text: 'Create Payment Link' },
        submit: { type: 'plain_text', text: 'Create Link' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify({
          channel_id: body.channel_id,
          user_id: body.user_id
        }),
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
            block_id: 'service_block',
            label: { type: 'plain_text', text: 'Service / Product Name' },
            element: {
              type: 'plain_text_input',
              action_id: 'service_input',
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
  });
}

module.exports = { register };
