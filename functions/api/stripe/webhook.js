// Import the webhook handler from the main stripe.js file
import { onRequest as stripeHandler } from '../stripe.js'

export async function onRequest(context) {
  // Forward to the main stripe handler which handles webhook routing
  return stripeHandler(context)
}
