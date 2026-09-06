import type { IOrder } from '../models/Order.model';

export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const amount = (value: number) => `${Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const addressLines = (order: IOrder) => [order.deliveryAddress?.street, [order.deliveryAddress?.city, order.deliveryAddress?.delegation].filter(Boolean).join(', ')].filter(Boolean);

export function orderEmailText(order: IOrder): string {
  return [
    'DIETTEMPLE — Votre commande est confirmée',
    `Bonjour ${order.deliveryAddress?.fullName || ''},`,
    `Merci pour votre confiance. Votre commande ${order.reference} a bien été enregistrée.`,
    ...order.items.map(item => `${item.name} × ${item.quantity} — ${amount(item.price * item.quantity)}`),
    `Sous-total : ${amount(order.subtotal)}`,
    ...(order.discount > 0 ? [`Réduction : −${amount(order.discount)}`] : []),
    `Livraison : ${order.deliveryFee ? amount(order.deliveryFee) : 'Offerte'}`,
    `Total : ${amount(order.totalPrice)}`,
    `Paiement : ${order.paymentStatus === 'PAID' ? 'Payé' : 'En attente'}`,
    'Livraison à :', order.deliveryAddress?.fullName, ...addressLines(order), order.deliveryAddress?.phone,
    'Nous vous contacterons si des précisions sont nécessaires pour votre livraison.',
    'Une question ? Répondez à cet e-mail en indiquant votre référence de commande.',
    'DietTemple · Nutrition & performance',
  ].filter(Boolean).join('\n');
}

export function orderEmailHtml(order: IOrder, admin = false): string {
  const e = escapeHtml;
  const rows = order.items.map(item => `<tr><td style="padding:18px 0;border-bottom:1px solid #e7e7dd;color:#20271b;font-size:14px;line-height:22px"><strong>${e(item.name)}</strong><br><span style="color:#6b725f;font-size:12px">${e(amount(item.price))} / unité · Quantité ${e(item.quantity)}</span></td><td align="right" style="padding:18px 0 18px 12px;border-bottom:1px solid #e7e7dd;color:#20271b;white-space:nowrap;font-size:14px;font-weight:bold">${e(amount(item.price * item.quantity))}</td></tr>`).join('');
  const summary = (label: string, value: string) => `<tr><td style="padding:7px 0;color:#65705b;font-size:13px">${label}</td><td align="right" style="padding:7px 0;color:#20271b;font-size:13px">${e(value)}</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Commande ${e(order.reference)} · DietTemple</title></head><body style="margin:0;padding:0;background:#eeefe8;font-family:Arial,Helvetica,sans-serif;color:#20271b">
  <div style="display:none;font-size:1px;color:#eeefe8;max-height:0;overflow:hidden">Votre commande ${e(order.reference)} est confirmée. Retrouvez votre récapitulatif et vos informations de livraison.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eeefe8"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fcfcf7;border-radius:24px;overflow:hidden">
    <tr><td style="padding:32px 26px;background:#182112;border-bottom:4px solid #dfc477"><p style="margin:0 0 28px;font-size:15px;letter-spacing:4px;font-weight:bold;color:#dfc477">DIETTEMPLE</p><p style="margin:0 0 12px;color:#c6d2b8;font-size:11px;letter-spacing:2px">${admin ? 'NOUVELLE COMMANDE' : 'MERCI POUR VOTRE CONFIANCE'}</p><h1 style="margin:0;color:#f9f8ef;font-size:30px;line-height:38px;letter-spacing:-1px">${admin ? 'Une commande à préparer.' : 'Votre commande<br>est confirmée.'}</h1><p style="margin:18px 0 0;color:#dfc477;font-size:13px;line-height:20px">Référence ${e(order.reference)}</p></td></tr>
    <tr><td style="padding:28px 26px"><p style="margin:0 0 12px;font-size:17px;line-height:25px;font-weight:bold">${admin ? 'Récapitulatif de la commande' : `Bonjour ${e(order.deliveryAddress?.fullName || '')},`}</p><p style="margin:0 0 26px;font-size:14px;line-height:23px;color:#65705b">${admin ? 'Une nouvelle commande a été enregistrée. Retrouvez les articles et les coordonnées du client ci-dessous.' : 'Vos essentiels nutrition ont bien été commandés. Retrouvez tous les détails de votre sélection ci-dessous.'}</p>
    <h2 style="margin:0;font-size:18px;color:#20271b">Votre sélection</h2><table width="100%" cellspacing="0" cellpadding="0" aria-label="Articles commandés">${rows}</table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px">${summary('Sous-total', amount(order.subtotal))}${order.discount > 0 ? summary('Réduction', `−${amount(order.discount)}`) : ''}${summary('Livraison', order.deliveryFee ? amount(order.deliveryFee) : 'Offerte')}<tr><td style="padding:18px 12px;background:#e9eddf;font-size:16px;font-weight:bold">Total</td><td align="right" style="padding:18px 12px;background:#e9eddf;font-size:23px;font-weight:bold;color:#364226">${e(amount(order.totalPrice))}</td></tr></table>
    <p style="margin:12px 0 26px;color:#65705b;font-size:12px">Paiement : ${order.paymentStatus === 'PAID' ? 'payé' : 'en attente'}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:20px;border:1px solid #dce1d2;border-radius:14px"><h2 style="margin:0 0 12px;font-size:16px">Votre livraison</h2><p style="margin:0;color:#65705b;font-size:14px;line-height:24px"><strong style="color:#20271b">${e(order.deliveryAddress?.fullName)}</strong><br>${addressLines(order).map(line => e(line).replace(/\n/g, '<br>')).join('<br>')}<br>${e(order.deliveryAddress?.phone)}<br>${e(order.deliveryAddress?.email)}</p></td></tr></table>
    <p style="margin:24px 0 0;color:#65705b;font-size:13px;line-height:22px">Nous vous contacterons si des précisions sont nécessaires pour votre livraison. Une question ? Répondez à cet e-mail en indiquant votre référence de commande.</p></td></tr>
    <tr><td align="center" style="padding:24px;background:#e9eddf"><p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;font-weight:bold;color:#364226">DIETTEMPLE</p><p style="margin:0;font-size:12px;color:#65705b">Nutrition &amp; performance. À vos côtés, chaque jour.</p></td></tr>
  </table></td></tr></table></body></html>`;
}
