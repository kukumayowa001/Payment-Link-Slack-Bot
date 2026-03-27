const Whop = require('@whop/sdk').default;
const config = require('../config');

// Initialize Whop SDK
const whop = new Whop({ apiKey: config.whopApiKey });

/**
 * Create a Whop payment plan (generates a payment link).
 * @param {number} amount - Price in USD
 * @param {string} serviceName - Name of the service/product
 * @param {string} userId - Slack user ID of the rep who created it
 * @param {string} clientName - Name of the client
 * @param {string} clientEmail - Email of the client
 * @returns {{ paymentLink: string, paymentId: string }}
 */
async function createPaymentPlan(amount, serviceName, userId, clientName = '', clientEmail = '') {
  const plan = await whop.plans.create({
    company_id: config.whopCompanyId,
    access_pass_id: config.whopProductId,
    initial_price: amount,
    plan_type: 'one_time',
    internal_notes: JSON.stringify({
      sl: userId,
      sv: serviceName,
      cl: clientName,
      em: clientEmail
    }),
    metadata: {
      creator_slack_id: userId,
      service_name: serviceName,
      client_name: clientName,
      client_email: clientEmail
    }
  });

  return {
    paymentLink: plan.direct_link,
    paymentId: plan.id
  };
}

/**
 * Retrieve details for a Whop plan.
 * @param {string} planId
 * @returns {object} Plan details from Whop
 */
async function getPlanDetails(planId) {
  return whop.plans.retrieve(planId);
}

module.exports = { createPaymentPlan, getPlanDetails };
