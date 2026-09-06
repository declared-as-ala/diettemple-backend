import { orderEmailHtml, orderEmailText } from './orderEmailTemplate';
import nodemailer from 'nodemailer';


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

const generateClientOrderEmail = orderEmailHtml;
const generateAdminOrderEmail = (order: IOrder) => orderEmailHtml(order, true);

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
      text: orderEmailText(order),
      replyTo: emailUser,
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
      text: orderEmailText(order),
      replyTo: emailUser,
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
