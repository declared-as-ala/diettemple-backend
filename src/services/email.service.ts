import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { IOrder } from '../models/Order.model';

const getTransporter = () => {
  const emailHost = process.env.EMAIL_HOST || 'diettemple.tn';
  const emailPort = parseInt(process.env.EMAIL_PORT || '465');
  const emailUser = process.env.EMAIL_USER || 'contact@diettemple.tn';
  const emailPass = process.env.EMAIL_PASS || '';

  console.log('📧 Email configuration:');
  console.log(`   Host: ${emailHost}:${emailPort}`);
  console.log(`   User: ${emailUser}`);

  return nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

const transporter = getTransporter();

// Verify transporter connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email transporter verification failed:', error);
  } else {
    console.log('✅ Email transporter is ready to send emails');
  }
});

// Admin email
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@diettemple.tn';

/**
 * Convert image to base64 for embedding in email
 */
function getLogoBase64(): string {
  try {
    // Try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '../assets/logo.png'),
      path.join(__dirname, '../../assets/logo.png'),
      path.join(process.cwd(), 'src/assets/logo.png'),
      path.join(process.cwd(), 'backend/src/assets/logo.png'),
    ];

    for (const logoPath of possiblePaths) {
      if (fs.existsSync(logoPath)) {
        console.log(`✅ Logo found at: ${logoPath}`);
        const imageBuffer = fs.readFileSync(logoPath);
        const base64 = imageBuffer.toString('base64');
        console.log(`✅ Logo converted to base64 (${base64.length} chars)`);
        return base64;
      }
    }

    console.warn('⚠️ Logo not found in any of the expected paths:', possiblePaths);
  } catch (error: any) {
    console.error('❌ Could not load logo for email:', error.message);
  }
  return '';
}

/**
 * Generate HTML email template for order confirmation (client)
 */
function generateClientOrderEmail(order: IOrder): string {
  const logoBase64 = getLogoBase64();
  const logoImg = logoBase64 
    ? `<img src="data:image/png;base64,${logoBase64}" alt="DietTemple Logo" style="max-width: 120px; height: auto; margin-bottom: 20px; display: block;" width="120" />`
    : '<h1 style="color: #00FF00; margin: 0;">DietTemple</h1>';

  const orderDate = new Date(order.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const statusLabel = order.status === 'confirmed' ? 'Confirmée' :
    order.status === 'pending' ? 'En attente' :
    order.status === 'shipped' ? 'Expédiée' :
    order.status === 'delivered' ? 'Livrée' :
    order.status === 'cancelled' ? 'Annulée' : order.status;

  const itemsHtml = order.items.map(item => `
    <tr style="border-bottom: 1px solid #e0e0e0;">
      <td style="padding: 12px; text-align: left;">${item.name}</td>
      <td style="padding: 12px; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; text-align: right;">${item.price.toFixed(2)} DT</td>
      <td style="padding: 12px; text-align: right; font-weight: bold;">${(item.price * item.quantity).toFixed(2)} DT</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation de commande - DietTemple</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #00FF00 0%, #00CC00 100%); padding: 30px; text-align: center;">
              ${logoImg}
              <h2 style="color: #000000; margin: 10px 0 0 0; font-size: 24px;">Confirmation de commande</h2>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Bonjour ${order.deliveryAddress?.fullName || 'Cher client'},
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Nous avons bien reçu votre commande et nous vous en remercions ! Votre commande est en cours de traitement.
              </p>

              <!-- Order Info Box -->
              <div style="background-color: #f9f9f9; border-left: 4px solid #00FF00; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #333333;">Informations de la commande</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Référence:</strong> ${order.reference}</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Date:</strong> ${orderDate}</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Statut:</strong> ${statusLabel}</p>
              </div>

              <!-- Delivery Address -->
              ${order.deliveryAddress ? `
              <div style="background-color: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #333333;">Adresse de livraison</p>
                <p style="margin: 5px 0; color: #666666;">${order.deliveryAddress.fullName}</p>
                <p style="margin: 5px 0; color: #666666;">${order.deliveryAddress.street}</p>
                <p style="margin: 5px 0; color: #666666;">${order.deliveryAddress.city}, ${order.deliveryAddress.delegation}</p>
                <p style="margin: 5px 0; color: #666666;">Téléphone: ${order.deliveryAddress.phone}</p>
                <p style="margin: 5px 0; color: #666666;">Email: ${order.deliveryAddress.email}</p>
              </div>
              ` : ''}

              <!-- Order Items -->
              <h3 style="color: #333333; font-size: 18px; margin: 30px 0 15px 0;">Articles commandés</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #00FF00;">
                    <th style="padding: 12px; text-align: left; color: #000000; font-weight: bold;">Produit</th>
                    <th style="padding: 12px; text-align: center; color: #000000; font-weight: bold;">Qté</th>
                    <th style="padding: 12px; text-align: right; color: #000000; font-weight: bold;">Prix unit.</th>
                    <th style="padding: 12px; text-align: right; color: #000000; font-weight: bold;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                <tr>
                  <td align="right" style="padding: 8px 12px; color: #666666;">Sous-total:</td>
                  <td align="right" style="padding: 8px 12px; color: #666666; width: 120px;">${order.subtotal.toFixed(2)} DT</td>
                </tr>
                ${order.discount > 0 ? `
                <tr>
                  <td align="right" style="padding: 8px 12px; color: #666666;">Réduction:</td>
                  <td align="right" style="padding: 8px 12px; color: #FF0000; width: 120px;">-${order.discount.toFixed(2)} DT</td>
                </tr>
                ` : ''}
                <tr>
                  <td align="right" style="padding: 8px 12px; color: #666666;">Frais de livraison:</td>
                  <td align="right" style="padding: 8px 12px; color: #666666; width: 120px;">${order.deliveryFee.toFixed(2)} DT</td>
                </tr>
                <tr style="border-top: 2px solid #00FF00;">
                  <td align="right" style="padding: 12px; font-size: 18px; font-weight: bold; color: #333333;">Total:</td>
                  <td align="right" style="padding: 12px; font-size: 18px; font-weight: bold; color: #333333; width: 120px;">${order.totalPrice.toFixed(2)} DT</td>
                </tr>
              </table>

              <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                Nous vous tiendrons informé de l'avancement de votre commande par email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 10px 0;">
                Merci pour votre achat !
              </p>
              <p style="color: #666666; font-size: 12px; margin: 0;">
                <strong>DietTemple</strong> - Votre partenaire nutrition<br>
                Email: contact@diettemple.tn | Téléphone: +216 XX XXX XXX
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generate HTML email template for order notification (admin)
 */
function generateAdminOrderEmail(order: IOrder): string {
  const logoBase64 = getLogoBase64();
  const logoImg = logoBase64 
    ? `<img src="data:image/png;base64,${logoBase64}" alt="DietTemple Logo" style="max-width: 120px; height: auto; margin-bottom: 20px; display: block;" width="120" />`
    : '<h1 style="color: #00FF00; margin: 0;">DietTemple</h1>';

  const orderDate = new Date(order.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const statusLabel = order.status === 'confirmed' ? 'Confirmée' :
    order.status === 'pending' ? 'En attente' :
    order.status === 'shipped' ? 'Expédiée' :
    order.status === 'delivered' ? 'Livrée' :
    order.status === 'cancelled' ? 'Annulée' : order.status;

  const itemsHtml = order.items.map(item => `
    <tr style="border-bottom: 1px solid #e0e0e0;">
      <td style="padding: 12px; text-align: left;">${item.name}</td>
      <td style="padding: 12px; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; text-align: right;">${item.price.toFixed(2)} DT</td>
      <td style="padding: 12px; text-align: right; font-weight: bold;">${(item.price * item.quantity).toFixed(2)} DT</td>
    </tr>
  `).join('');

  const customerInfo = order.deliveryAddress 
    ? `${order.deliveryAddress.fullName}<br>${order.deliveryAddress.email}<br>${order.deliveryAddress.phone}`
    : order.userId ? `Utilisateur ID: ${order.userId}` : 'Client invité';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouvelle commande - DietTemple</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%); padding: 30px; text-align: center;">
              ${logoImg}
              <h2 style="color: #ffffff; margin: 10px 0 0 0; font-size: 24px;">⚠️ Nouvelle commande reçue</h2>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Une nouvelle commande a été passée et nécessite votre attention.
              </p>

              <!-- Order Info Box -->
              <div style="background-color: #fff3cd; border-left: 4px solid #FF6B6B; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #333333;">Informations de la commande</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Référence:</strong> ${order.reference}</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Date:</strong> ${orderDate}</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Statut:</strong> ${statusLabel}</p>
                <p style="margin: 5px 0; color: #666666;"><strong>Montant total:</strong> <span style="font-size: 18px; font-weight: bold; color: #FF6B6B;">${order.totalPrice.toFixed(2)} DT</span></p>
              </div>

              <!-- Customer Info -->
              <div style="background-color: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #333333;">Informations client</p>
                <p style="margin: 5px 0; color: #666666;">${customerInfo}</p>
                ${order.deliveryAddress ? `
                <p style="margin: 15px 0 5px 0; font-weight: bold; color: #333333;">Adresse de livraison:</p>
                <p style="margin: 5px 0; color: #666666;">${order.deliveryAddress.street}</p>
                <p style="margin: 5px 0; color: #666666;">${order.deliveryAddress.city}, ${order.deliveryAddress.delegation}</p>
                ` : ''}
              </div>

              <!-- Order Items -->
              <h3 style="color: #333333; font-size: 18px; margin: 30px 0 15px 0;">Articles commandés</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #FF6B6B;">
                    <th style="padding: 12px; text-align: left; color: #ffffff; font-weight: bold;">Produit</th>
                    <th style="padding: 12px; text-align: center; color: #ffffff; font-weight: bold;">Qté</th>
                    <th style="padding: 12px; text-align: right; color: #ffffff; font-weight: bold;">Prix unit.</th>
                    <th style="padding: 12px; text-align: right; color: #ffffff; font-weight: bold;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                <tr>
                  <td align="right" style="padding: 8px 12px; color: #666666;">Sous-total:</td>
                  <td align="right" style="padding: 8px 12px; color: #666666; width: 120px;">${order.subtotal.toFixed(2)} DT</td>
                </tr>
                ${order.discount > 0 ? `
                <tr>
                  <td align="right" style="padding: 8px 12px; color: #666666;">Réduction:</td>
                  <td align="right" style="padding: 8px 12px; color: #FF0000; width: 120px;">-${order.discount.toFixed(2)} DT</td>
                </tr>
                ` : ''}
                <tr>
                  <td align="right" style="padding: 8px 12px; color: #666666;">Frais de livraison:</td>
                  <td align="right" style="padding: 8px 12px; color: #666666; width: 120px;">${order.deliveryFee.toFixed(2)} DT</td>
                </tr>
                <tr style="border-top: 2px solid #FF6B6B;">
                  <td align="right" style="padding: 12px; font-size: 18px; font-weight: bold; color: #333333;">Total:</td>
                  <td align="right" style="padding: 12px; font-size: 18px; font-weight: bold; color: #FF6B6B; width: 120px;">${order.totalPrice.toFixed(2)} DT</td>
                </tr>
              </table>

              <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                Veuillez traiter cette commande dans les plus brefs délais.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="color: #666666; font-size: 12px; margin: 0;">
                <strong>DietTemple</strong> - Système de notification<br>
                Cette notification a été générée automatiquement.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Send order confirmation email to client
 */
export async function sendOrderConfirmationEmail(order: IOrder): Promise<void> {
  if (!order.deliveryAddress?.email) {
    console.warn('⚠️ No email address provided for order confirmation');
    return;
  }

  try {
    // Verify transporter is configured
    if (!transporter) {
      console.error('❌ Email transporter not configured');
      return;
    }

    const html = generateClientOrderEmail(order);
    const emailUser = process.env.EMAIL_USER || 'contact@diettemple.tn';
    
    console.log(`📧 Sending order confirmation email to: ${order.deliveryAddress.email}`);
    console.log(`📧 From: ${emailUser}`);
    
    const info = await transporter.sendMail({
      from: `"DietTemple" <${emailUser}>`,
      to: order.deliveryAddress.email,
      subject: `Confirmation de commande - ${order.reference}`,
      html,
    });

    console.log(`✅ Order confirmation email sent successfully!`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   To: ${order.deliveryAddress.email}`);
  } catch (error: any) {
    console.error('❌ Error sending order confirmation email:', error);
    console.error('   Error details:', error.message);
    if (error.response) {
      console.error('   SMTP Response:', error.response);
    }
    // Don't throw - email failure shouldn't break order creation
  }
}

/**
 * Send order notification email to admin
 */
export async function sendOrderNotificationEmail(order: IOrder): Promise<void> {
  try {
    // Verify transporter is configured
    if (!transporter) {
      console.error('❌ Email transporter not configured');
      return;
    }

    const html = generateAdminOrderEmail(order);
    const emailUser = process.env.EMAIL_USER || 'contact@diettemple.tn';
    
    console.log(`📧 Sending order notification email to admin: ${ADMIN_EMAIL}`);
    console.log(`📧 From: ${emailUser}`);
    
    const info = await transporter.sendMail({
      from: `"DietTemple" <${emailUser}>`,
      to: ADMIN_EMAIL,
      subject: `🚨 Nouvelle commande - ${order.reference} - ${order.totalPrice.toFixed(2)} DT`,
      html,
    });

    console.log(`✅ Order notification email sent successfully!`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   To: ${ADMIN_EMAIL}`);
  } catch (error: any) {
    console.error('❌ Error sending order notification email:', error);
    console.error('   Error details:', error.message);
    if (error.response) {
      console.error('   SMTP Response:', error.response);
    }
    // Don't throw - email failure shouldn't break order creation
  }
}

/**
 * Send both client and admin emails for an order
 */
export async function sendOrderEmails(order: IOrder): Promise<void> {
  await Promise.all([
    sendOrderConfirmationEmail(order),
    sendOrderNotificationEmail(order),
  ]);
}

/**
 * Send new lead / rendez-vous notification to admin
 */
export async function sendNewLeadNotification(lead: {
  name: string;
  email: string;
  phone: string;
  goal?: string;
  gender?: string;
  source?: string;
}): Promise<void> {
  try {
    const emailUser = process.env.EMAIL_USER || 'contact@diettemple.tn';
    const goalLabels: Record<string, string> = {
      'fat-loss': 'Perte de masse grasse',
      'muscle': 'Prise de muscle',
      'recomp': 'Recomposition corporelle',
      'performance': 'Performance sportive',
      'wellness': 'Santé & longévité',
    };
    const goalLabel = goalLabels[lead.goal || ''] || lead.goal || '—';
    const genderLabel = lead.gender === 'homme' ? 'Homme' : lead.gender === 'femme' ? 'Femme' : '—';
    const sourceLabel = lead.source === 'mobile' ? 'Application Mobile' : 'Site Web';
    const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Tunis' });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1a1200,#2a1f00);padding:28px 32px;border-bottom:2px solid #D4AF37;">
          <h1 style="margin:0;color:#D4AF37;font-size:22px;letter-spacing:1px;">🗓 Nouvelle Demande de Rendez-vous</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">DietTemple · ${now}</p>
        </div>
        <div style="padding:28px 32px;space-y:16px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:10px 0;color:rgba(255,255,255,0.5);font-size:12px;width:140px;text-transform:uppercase;letter-spacing:0.5px;">Nom</td><td style="padding:10px 0;color:#fff;font-size:15px;font-weight:bold;">${lead.name}</td></tr>
            <tr style="border-top:1px solid #1f1f1f;"><td style="padding:10px 0;color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Email</td><td style="padding:10px 0;color:#D4AF37;font-size:14px;"><a href="mailto:${lead.email}" style="color:#D4AF37;">${lead.email}</a></td></tr>
            <tr style="border-top:1px solid #1f1f1f;"><td style="padding:10px 0;color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Téléphone</td><td style="padding:10px 0;color:#fff;font-size:14px;"><a href="tel:${lead.phone}" style="color:#fff;">${lead.phone}</a></td></tr>
            <tr style="border-top:1px solid #1f1f1f;"><td style="padding:10px 0;color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Objectif</td><td style="padding:10px 0;color:#fff;font-size:14px;">${goalLabel}</td></tr>
            <tr style="border-top:1px solid #1f1f1f;"><td style="padding:10px 0;color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Genre</td><td style="padding:10px 0;color:#fff;font-size:14px;">${genderLabel}</td></tr>
            <tr style="border-top:1px solid #1f1f1f;"><td style="padding:10px 0;color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Source</td><td style="padding:10px 0;font-size:13px;"><span style="background:#D4AF37;color:#000;padding:3px 10px;border-radius:20px;font-weight:bold;font-size:12px;">${sourceLabel}</span></td></tr>
          </table>
        </div>
        <div style="padding:18px 32px;background:#111;border-top:1px solid #1f1f1f;text-align:center;">
          <a href="https://admin.diettemple.tn/admin/leads" style="display:inline-block;background:#D4AF37;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Voir dans le dashboard admin →</a>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"DietTemple" <${emailUser}>`,
      to: ADMIN_EMAIL,
      subject: `🗓 Nouveau rendez-vous — ${lead.name} (${sourceLabel})`,
      html,
    });
    console.log(`✅ Lead notification sent to ${ADMIN_EMAIL}`);
  } catch (error: any) {
    console.error('❌ Error sending lead notification email:', error.message);
  }
}
