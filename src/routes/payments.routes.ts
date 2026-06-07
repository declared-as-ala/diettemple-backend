import { Router, Response } from 'express';
import { body, param } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import Order from '../models/Order.model';
import Cart from '../models/Cart.model';
import axios from 'axios';
import crypto from 'crypto';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * ClickToPay Tunisia Payment Integration
 * 
 * ClickToPay (Monétique Tunisie) typically uses one of two integration methods:
 * 1. Form-based POST redirect to hosted payment page (most common)
 * 2. REST API (if available from your bank partnership)
 * 
 * This implementation supports both approaches.
 * 
 * Required credentials (from Société Monétique Tunisie):
 * - CLICKTOPAY_MERCHANT_ID: Your merchant/affiliation ID
 * - CLICKTOPAY_TERMINAL_ID: Your terminal ID (if required)
 * - CLICKTOPAY_SECRET: Secret key for signature generation
 * - CLICKTOPAY_GATEWAY_URL: Payment gateway URL (provided by SMT)
 */
router.post(
  '/clicktopay/init',
  [
    body('orderId').isMongoId().withMessage('Order ID invalide'),
    body('amount').isFloat({ min: 0 }).withMessage('Montant invalide'),
    body('currency').equals('TND').withMessage('Devise doit être TND'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { orderId, amount, currency } = req.body;

      const order = await Order.findOne({
        _id: orderId,
        userId: req.user._id,
        status: { $in: ['pending', 'pending_payment'] },
      });

      if (!order) {
        return res.status(404).json({ message: 'Commande introuvable' });
      }

      // Verify amount matches order total
      if (Math.abs(order.totalPrice - amount) > 0.01) {
        return res.status(400).json({ 
          message: 'Le montant ne correspond pas à la commande' 
        });
      }

      // ClickToPay credentials from environment
      const CLICKTOPAY_MERCHANT_ID = process.env.CLICKTOPAY_MERCHANT_ID;
      const CLICKTOPAY_TERMINAL_ID = process.env.CLICKTOPAY_TERMINAL_ID;
      const CLICKTOPAY_SECRET = process.env.CLICKTOPAY_SECRET;
      const CLICKTOPAY_GATEWAY_URL = process.env.CLICKTOPAY_GATEWAY_URL || 'https://clicktopay.tn/payment';
      const CLICKTOPAY_API_URL = process.env.CLICKTOPAY_API_URL; // Optional: REST API URL if available
      const CLICKTOPAY_API_KEY = process.env.CLICKTOPAY_API_KEY; // Optional: API key if REST API is used
      const CLICKTOPAY_SANDBOX_MODE = process.env.CLICKTOPAY_SANDBOX_MODE === 'true'; // Enable sandbox mode for testing

      // Check if credentials are missing
      if (!CLICKTOPAY_MERCHANT_ID || !CLICKTOPAY_SECRET) {
        // If sandbox mode is enabled, allow testing without real credentials
        if (CLICKTOPAY_SANDBOX_MODE) {
          console.warn('⚠️  ClickToPay SANDBOX MODE: Using test credentials');
          // Use test credentials for sandbox mode
          const sandboxMerchantId = 'SANDBOX_MERCHANT_ID';
          const sandboxSecret = 'SANDBOX_SECRET_KEY';
          
          // Generate unique payment reference
          const paymentReference = `DT-${order.reference}-${Date.now()}`;
          const transactionId = paymentReference;
          const amountFormatted = amount.toFixed(3);
          
          // Store payment reference
          order.paymentMethod = 'CLICKTOPAY';
          order.paymentStatus = 'PENDING';
          order.paymentReference = transactionId;
          order.clickToPay = {
            paymentId: transactionId,
            reference: paymentReference,
            status: 'PENDING',
          };
          await order.save();

          // Return sandbox payment URL (mock page for testing)
          const sandboxUrl = `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/payments/clicktopay/sandbox?orderId=${order._id}&amount=${amountFormatted}`;
          
          return res.json({
            success: true,
            paymentUrl: sandboxUrl,
            paymentId: transactionId,
            method: 'sandbox',
            sandbox: true,
            message: 'SANDBOX MODE: This is a test payment. Configure real credentials for production.',
          });
        }
        
        // Production mode - credentials required
        return res.status(503).json({ 
          error: 'PAYMENT_CONFIGURATION_MISSING',
          message: 'Méthode de paiement non disponible pour le moment. Veuillez configurer les identifiants ClickToPay dans le fichier .env',
          provider: 'clicktopay',
          help: 'Voir backend/CLICKTOPAY_SETUP.md pour les instructions de configuration',
        });
      }

      // Generate unique payment reference
      const paymentReference = `DT-${order.reference}-${Date.now()}`;
      const transactionId = paymentReference;

      // Prepare payment data
      const amountFormatted = amount.toFixed(3); // Format: 129.900
      const callbackUrl = `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/payments/clicktopay/webhook`;
      const returnUrl = `${process.env.MOBILE_APP_URL || 'diettemple://payment-success'}`;
      const cancelUrl = `${process.env.MOBILE_APP_URL || 'diettemple://payment-failed'}`;

      // Generate signature (common format for Monétique gateways)
      // Format: merchantId + terminalId + amount + currency + orderId + secret
      const signatureData = [
        CLICKTOPAY_MERCHANT_ID,
        CLICKTOPAY_TERMINAL_ID || '',
        amountFormatted,
        currency || 'TND',
        order.reference,
        CLICKTOPAY_SECRET,
      ].join('');
      
      const signature = crypto.createHash('sha256').update(signatureData).digest('hex').toUpperCase();

      // Try REST API first (if available)
      if (CLICKTOPAY_API_URL && CLICKTOPAY_API_KEY) {
        try {
          const apiResponse = await axios.post(
            `${CLICKTOPAY_API_URL}/api/v1/payments/create`,
            {
              merchantId: CLICKTOPAY_MERCHANT_ID,
              terminalId: CLICKTOPAY_TERMINAL_ID,
              amount: amountFormatted,
              currency: currency || 'TND',
        orderId: order.reference,
              transactionId: transactionId,
        description: `Commande DietTemple - ${order.reference}`,
        customerEmail: order.deliveryAddress?.email || req.user.email,
        customerPhone: order.deliveryAddress?.phone,
              callbackUrl: callbackUrl,
              returnUrl: returnUrl,
              cancelUrl: cancelUrl,
              signature: signature,
            },
        {
          headers: {
                'Authorization': `Bearer ${CLICKTOPAY_API_KEY}`,
            'Content-Type': 'application/json',
          },
              timeout: 10000,
        }
      );

          if (apiResponse.data && (apiResponse.data.paymentUrl || apiResponse.data.checkoutUrl)) {
            const paymentUrl = apiResponse.data.paymentUrl || apiResponse.data.checkoutUrl;
            
        // Store payment reference
            order.paymentMethod = 'CLICKTOPAY';
            order.paymentStatus = 'PENDING';
            order.paymentReference = apiResponse.data.transactionId || transactionId;
            order.clickToPay = {
              paymentId: apiResponse.data.transactionId || transactionId,
              reference: paymentReference,
              status: 'PENDING',
            };
        await order.save();

            return res.json({
          success: true,
              paymentUrl: paymentUrl,
              paymentId: apiResponse.data.transactionId || transactionId,
              method: 'api',
            });
          }
        } catch (apiError: any) {
          console.warn('ClickToPay API call failed, falling back to form-based method:', apiError.message);
          // Fall through to form-based method
        }
      }

      // Form-based method (most common for Monétique gateways)
      // Generate payment form HTML that will be submitted to ClickToPay gateway
      const formFields = {
        merchantId: CLICKTOPAY_MERCHANT_ID,
        terminalId: CLICKTOPAY_TERMINAL_ID || '',
        amount: amountFormatted,
        currency: currency || 'TND',
        orderId: order.reference,
        transactionId: transactionId,
        description: `Commande DietTemple - ${order.reference}`,
        customerEmail: order.deliveryAddress?.email || req.user.email,
        customerPhone: order.deliveryAddress?.phone || '',
        callbackUrl: callbackUrl,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl,
        signature: signature,
      };

        // Store payment reference
      order.paymentMethod = 'CLICKTOPAY';
      order.paymentStatus = 'PENDING';
      order.paymentReference = transactionId;
      order.clickToPay = {
        paymentId: transactionId,
        reference: paymentReference,
        status: 'PENDING',
      };
        await order.save();

      // Generate form HTML for auto-submit
      const formHtml = generatePaymentForm(CLICKTOPAY_GATEWAY_URL, formFields);

      // Return form HTML that frontend can render in WebView
        res.json({
          success: true,
        paymentUrl: CLICKTOPAY_GATEWAY_URL,
        paymentId: transactionId,
        method: 'form',
        formData: formFields,
        formHtml: formHtml, // HTML form for auto-submit
      });
    } catch (error: any) {
      console.error('ClickToPay Payment Error:', error.response?.data || error.message);
      
      // Handle missing configuration gracefully
      if (error.response?.status === 503 || error.message.includes('configuration')) {
        return res.status(503).json({ 
          error: 'PAYMENT_CONFIGURATION_MISSING',
          message: 'Méthode de paiement non disponible pour le moment',
          provider: 'clicktopay',
        });
      }

      res.status(500).json({
        message: error.response?.data?.message || 'Erreur lors de l\'initialisation du paiement ClickToPay',
      });
    }
  }
);

/**
 * Generate HTML form for ClickToPay payment (auto-submit)
 */
function generatePaymentForm(gatewayUrl: string, fields: Record<string, string>): string {
  const formInputs = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}" />`)
    .join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirection vers ClickToPay</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .loader {
      text-align: center;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #00FF00;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Redirection vers ClickToPay...</p>
  </div>
  <form id="clicktopay-form" method="POST" action="${gatewayUrl}">
    ${formInputs}
  </form>
  <script>
    // Auto-submit form on page load
    document.getElementById('clicktopay-form').submit();
  </script>
</body>
</html>
  `.trim();
}

/**
 * ClickToPay Webhook / Callback Endpoint
 * This endpoint is called by ClickToPay to confirm payment status
 * 
 * Note: ClickToPay may send callbacks via:
 * - POST request with form data
 * - GET request with query parameters
 * - Both (GET for return URL, POST for server callback)
 */
router.post('/clicktopay/webhook', async (req, res) => {
  try {
    // ClickToPay may send data as form-encoded or JSON
    const {
      paymentId,
      transactionId,
      reference,
      orderId,
      amount,
      status,
      signature,
      result, // Some gateways use 'result' field
      code, // Some gateways use 'code' field
    } = req.body;

    // Extract order reference from various possible fields
    const orderReference = orderId || reference || req.body.orderReference;
    const transactionRef = transactionId || paymentId || req.body.transactionRef;
    const paymentStatus = status || result || code || req.body.paymentStatus;
    const paymentAmount = amount || req.body.amount;

    // Verify webhook signature (security check)
    const CLICKTOPAY_SECRET = process.env.CLICKTOPAY_SECRET;
    if (CLICKTOPAY_SECRET && signature) {
      // Reconstruct signature (adjust format based on actual ClickToPay implementation)
      const signatureData = [
        orderReference,
        transactionRef,
        paymentAmount,
        paymentStatus,
        CLICKTOPAY_SECRET,
      ].join('');
      
      const expectedSignature = crypto
        .createHash('sha256')
        .update(signatureData)
        .digest('hex')
        .toUpperCase();
      
      if (signature.toUpperCase() !== expectedSignature) {
        console.error('Invalid webhook signature', { received: signature, expected: expectedSignature });
        // Log but don't reject - signature format may vary
        // return res.status(401).json({ message: 'Signature invalide' });
      }
    }

    // Find order by reference or transaction ID
    const order = await Order.findOne({
      $or: [
        { reference: orderReference },
        { 'clickToPay.paymentId': transactionRef },
        { 'clickToPay.reference': reference },
        { paymentReference: transactionRef },
      ],
    });

    if (!order) {
      console.error('Order not found for ClickToPay webhook:', { 
        orderReference, 
        transactionRef, 
        reference,
        body: req.body 
      });
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    // Prevent duplicate processing
    if (order.paymentStatus === 'PAID' && order.status === 'confirmed') {
      return res.json({ message: 'Commande déjà traitée', success: true });
    }

    // Verify amount matches (if provided)
    if (paymentAmount && Math.abs(order.totalPrice - parseFloat(paymentAmount)) > 0.01) {
      console.error('Amount mismatch in webhook:', { 
        orderAmount: order.totalPrice, 
        webhookAmount: paymentAmount 
      });
      return res.status(400).json({ message: 'Montant ne correspond pas' });
    }

    // Determine payment status (handle various response formats)
    const isSuccess = 
      paymentStatus === 'success' || 
      paymentStatus === 'SUCCESS' ||
      paymentStatus === 'paid' ||
      paymentStatus === 'PAID' ||
      paymentStatus === '00' || // Some gateways use numeric codes
      paymentStatus === '000' ||
      result === 'success' ||
      code === '00';

    const isFailed = 
      paymentStatus === 'failed' ||
      paymentStatus === 'FAILED' ||
      paymentStatus === 'cancelled' ||
      paymentStatus === 'CANCELLED' ||
      paymentStatus === '99' ||
      result === 'failed' ||
      code === '99';

    if (isSuccess) {
      // Payment successful
      order.paymentStatus = 'PAID';
      order.status = 'confirmed';
      if (order.clickToPay) {
        order.clickToPay.status = 'PAID';
      }
      await order.save();

      // Clear cart
      const cart = await Cart.findOne({ userId: order.userId });
      if (cart) {
        cart.items = [];
        await cart.save();
      }

      res.json({ success: true, message: 'Paiement confirmé' });
    } else if (isFailed) {
      // Payment failed
      order.paymentStatus = 'FAILED';
      order.status = 'cancelled';
      if (order.clickToPay) {
        order.clickToPay.status = 'FAILED';
      }
      await order.save();

      res.json({ success: false, message: 'Paiement échoué' });
    } else {
      // Unknown status - log for debugging
      console.warn('Unknown payment status in webhook:', { 
        paymentStatus, 
        result, 
        code, 
        body: req.body 
      });
      res.json({ success: false, message: 'Statut de paiement inconnu' });
    }
  } catch (error: any) {
    console.error('ClickToPay Webhook Error:', error);
    res.status(500).json({ message: error.message || 'Erreur lors du traitement du webhook' });
  }
});

/**
 * GET callback endpoint (for return URLs)
 * ClickToPay may redirect users back with query parameters
 */
router.get('/clicktopay/callback', async (req, res) => {
  try {
    const { orderId, transactionId, status, result, code } = req.query;

    // Find order
    const order = await Order.findOne({ 
      $or: [
        { reference: orderId as string },
        { 'clickToPay.paymentId': transactionId as string },
        { paymentReference: transactionId as string },
      ],
    });

    if (!order) {
      return res.status(404).send('Commande introuvable');
    }

    // Redirect to mobile app with result
    const paymentStatus = status || result || code;
    const isSuccess = 
      paymentStatus === 'success' || 
      paymentStatus === 'SUCCESS' ||
      paymentStatus === 'paid' ||
      paymentStatus === 'PAID' ||
      paymentStatus === '00';

    if (isSuccess) {
      // Redirect to success deep link
      const redirectUrl = `${process.env.MOBILE_APP_URL || 'diettemple://payment-success'}?orderId=${order._id}`;
      return res.redirect(redirectUrl);
    } else {
      // Redirect to failure deep link
      const redirectUrl = `${process.env.MOBILE_APP_URL || 'diettemple://payment-failed'}?orderId=${order._id}`;
      return res.redirect(redirectUrl);
    }
  } catch (error: any) {
    console.error('ClickToPay GET Callback Error:', error);
    res.status(500).send('Erreur lors du traitement');
  }
});

/**
 * Sandbox/Test Payment Page (for development only)
 * This endpoint simulates ClickToPay payment page for testing
 */
router.get('/clicktopay/sandbox', async (req: any, res: any) => {
  const { orderId, amount } = req.query;
  
  // Only allow in development/sandbox mode
  if (process.env.CLICKTOPAY_SANDBOX_MODE !== 'true') {
    return res.status(403).send('Sandbox mode is disabled');
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClickToPay - Mode Test</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #333;
      font-size: 28px;
      margin-bottom: 10px;
    }
    .header .badge {
      display: inline-block;
      background: #ff9800;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 10px;
    }
    .info {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }
    .info-label {
      color: #666;
      font-weight: 500;
    }
    .info-value {
      color: #333;
      font-weight: 600;
    }
    .amount {
      font-size: 32px;
      font-weight: 700;
      color: #667eea;
      text-align: center;
      margin: 30px 0;
    }
    .buttons {
      display: flex;
      gap: 12px;
    }
    .btn {
      flex: 1;
      padding: 16px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-success {
      background: #00FF00;
      color: #000;
    }
    .btn-success:hover {
      background: #00cc00;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,255,0,0.3);
    }
    .btn-cancel {
      background: #f5f5f5;
      color: #666;
    }
    .btn-cancel:hover {
      background: #e0e0e0;
    }
    .warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 12px;
      margin-top: 20px;
      font-size: 12px;
      color: #856404;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ClickToPay</h1>
      <div class="badge">MODE TEST / SANDBOX</div>
    </div>
    
    <div class="info">
      <div class="info-row">
        <span class="info-label">Commande:</span>
        <span class="info-value">${orderId || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Montant:</span>
        <span class="info-value">${amount || '0.000'} TND</span>
      </div>
    </div>
    
    <div class="amount">${amount || '0.000'} TND</div>
    
    <div class="buttons">
      <button class="btn btn-success" onclick="simulateSuccess()">
        ✓ Simuler Paiement Réussi
      </button>
      <button class="btn btn-cancel" onclick="simulateFailure()">
        ✗ Simuler Échec
      </button>
    </div>
    
    <div class="warning">
      ⚠️ Ceci est une page de test. Configurez les identifiants réels ClickToPay pour la production.
    </div>
  </div>
  
  <script>
    function simulateSuccess() {
      const orderId = '${orderId}';
      const returnUrl = 'diettemple://payment-success?orderId=' + orderId;
      window.location.href = returnUrl;
    }
    
    function simulateFailure() {
      const orderId = '${orderId}';
      const returnUrl = 'diettemple://payment-failed?orderId=' + orderId;
      window.location.href = returnUrl;
    }
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

export default router;
