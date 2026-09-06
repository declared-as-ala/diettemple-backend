import PDFDocument from 'pdfkit';
import type { IOrder } from '../models/Order.model';
import { dietTempleLogoPath } from './brandAssets';

/** Branded order recap, with repeated table headings and numbered pages. */
export async function generateOrderPDF(order: IOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Récapitulatif ${order.reference}`, Author: 'DietTemple', Subject: 'Récapitulatif de commande' } });
    const buffers: Buffer[] = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    try {
      const W = doc.page.width, H = doc.page.height, left = 40, width = W - 80, bottom = H - 70;
      const ink = '#24301C', muted = '#68735C', gold = '#DFC477', pale = '#EAF0DF';
      const money = (n: number) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, ' ')} DT`;
      const text = (value: string, x: number, y: number, size = 10, color = ink, bold = false, options: PDFKit.Mixins.TextOptions = {}) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(value, x, y, { lineBreak: false, ...options });
      };
      let y = 0;
      const page = (first: boolean) => {
        doc.rect(0, 0, W, H).fill('#FCFCF7');
        doc.rect(0, 0, W, first ? 185 : 95).fill('#182112');
        doc.image(dietTempleLogoPath, left, 24, { fit: [58, 58] });
        text('DIETTEMPLE', 112, 32, 19, '#F6F6EB', true);
        text('NUTRITION & PERFORMANCE', 113, 60, 8, gold);
        text(order.reference, 320, 34, 11, gold, true, { width: W - 360, align: 'right' });
        if (first) {
          text('Récapitulatif de commande', left, 111, 25, '#F6F6EB', true);
          text('Votre sélection. Tous les détails, en un seul endroit.', left, 151, 10, '#C7D2BA');
          y = 211;
        } else y = 119;
      };
      const nextPage = () => { doc.addPage(); page(false); };
      const wrap = (value: string, maxWidth: number, fontSize: number) => {
        doc.font('Helvetica').fontSize(fontSize);
        const lines: string[] = [];
        for (const paragraph of value.split(/\r?\n/)) {
          let line = '';
          for (const word of paragraph.split(/\s+/)) {
            if (doc.widthOfString((line ? line + ' ' : '') + word) <= maxWidth) { line += (line ? ' ' : '') + word; continue; }
            if (line) { lines.push(line); line = ''; }
            for (const char of word) {
              if (doc.widthOfString(line + char) > maxWidth) { lines.push(line); line = ''; }
              line += char;
            }
          }
          lines.push(line);
        }
        return lines;
      };
      page(true);
      const date = new Date(order.createdAt);
      const dateLabel = Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Africa/Tunis' });
      const statuses: Record<string, string> = { confirmed: 'Confirmée', pending: 'En attente', pending_payment: 'Paiement en attente', paid: 'Payée', failed: 'Échouée', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' };
      text('DATE DE COMMANDE', left, y, 8, muted, true);
      text('STATUT', 310, y, 8, muted, true);
      text(dateLabel, left, y + 17, 11, ink, true);
      text(statuses[order.status] || order.status, 310, y + 17, 11, ink, true);
      y += 61;
      text('Livraison & coordonnées', left, y, 14, ink, true); y += 27;
      const a = order.deliveryAddress;
      const address = a ? [a.fullName, a.street, [a.city, a.delegation].filter(Boolean).join(', '), a.phone, a.email].filter(Boolean).join('\n') : 'Adresse non renseignée';
      for (const line of wrap(address, width - 24, 10)) {
        if (y + 18 > bottom) nextPage();
        doc.rect(left, y - 3, width, 18).fill(pale);
        text(line, left + 12, y, 10); y += 18;
      }
      y += 25;
      const tableHeader = () => {
        doc.roundedRect(left, y, width, 29, 5).fill(ink);
        text('PRODUIT', left + 12, y + 10, 8, '#F8F8EF', true);
        text('QTÉ', 329, y + 10, 8, '#F8F8EF', true, { width: 30, align: 'center' });
        text('PRIX UNIT.', 367, y + 10, 8, '#F8F8EF', true, { width: 76, align: 'right' });
        text('TOTAL', 450, y + 10, 8, '#F8F8EF', true, { width: 91, align: 'right' }); y += 29;
      };
      if (y + 70 > bottom) nextPage();
      tableHeader();
      order.items.forEach((item, index) => {
        const lines = wrap(item.name, 260, 10);
        const rowHeight = lines.length * 14 + 20;
        // Keep normal product rows together; split only rows taller than a full page.
        if (rowHeight <= bottom - 148 && y + rowHeight > bottom) { nextPage(); tableHeader(); }
        let start = 0;
        while (start < lines.length) {
          if (y + 38 > bottom) { nextPage(); tableHeader(); }
          const take = Math.min(lines.length - start, Math.max(1, Math.floor((bottom - y - 20) / 14)));
          const height = take * 14 + 20;
          doc.rect(left, y, width, height).fill(index % 2 ? '#FCFCF7' : '#F0F3E9');
          lines.slice(start, start + take).forEach((line, i) => text(line, left + 12, y + 11 + i * 14, 10));
          if (start === 0) {
            text(String(item.quantity), 329, y + 11, 10, ink, false, { width: 30, align: 'center' });
            text(money(item.price), 367, y + 11, 9, muted, false, { width: 76, align: 'right' });
            text(money(item.price * item.quantity), 450, y + 11, 10, ink, true, { width: 91, align: 'right' });
          }
          y += height; start += take;
        }
      });
      y += 24;
      if (y + 180 > bottom) nextPage();
      const sum = (label: string, value: string) => { text(label, 300, y, 10, muted); text(value, 432, y, 10, ink, false, { width: 109, align: 'right' }); y += 24; };
      sum('Sous-total', money(order.subtotal));
      if (order.discount > 0) sum('Réduction', `-${money(order.discount)}`);
      sum('Livraison', order.deliveryFee ? money(order.deliveryFee) : 'Offerte');
      doc.roundedRect(287, y, W - 327, 52, 8).fill(ink);
      text('TOTAL', 302, y + 21, 10, '#F6F6EB', true);
      text(money(order.totalPrice), 371, y + 17, 18, gold, true, { width: 170, align: 'right' }); y += 67;
      text(`Paiement : ${order.paymentStatus === 'PAID' ? 'payé' : 'en attente'}`, 300, y, 9, muted); y += 33;
      if (y + 45 > bottom) nextPage();
      text('Merci de faire confiance à DietTemple.', left, y, 12, ink, true);
      text('Une question ? contact@diettemple.tn · Indiquez votre référence de commande.', left, y + 21, 9, muted);
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        // Footer sits inside the reserved margin; avoid PDFKit auto-adding a page.
        doc.page.margins.bottom = 0;
        doc.moveTo(left, H - 48).lineTo(W - left, H - 48).lineWidth(0.5).strokeColor('#CFD8C2').stroke();
        text('DIETTEMPLE · Récapitulatif de commande', left, H - 34, 8, muted);
        text(`${i + 1} / ${range.count}`, W - 100, H - 34, 8, muted, false, { width: 60, align: 'right' });
      }
      doc.end();
    } catch (error) { reject(error); }
  });
}
