import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { IOrder } from '../models/Order.model';

/**
 * Generate PDF invoice for an order
 * Returns a buffer that can be sent as response
 */
export async function generateOrderPDF(order: IOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4',
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Try to load logo
      const logoPath = path.join(__dirname, '../assets/logo.png');
      let hasLogo = false;
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 50, 50, { width: 80, height: 80 });
          hasLogo = true;
        } catch (error) {
          console.warn('Could not load logo:', error);
        }
      }

      // Header Section with Logo
      const headerY = hasLogo ? 50 : 50;
      const textStartX = hasLogo ? 150 : 50;
      
      if (!hasLogo) {
        // If no logo, show text logo
        doc.fontSize(28)
          .font('Helvetica-Bold')
          .fillColor('#00FF00')
          .text('DietTemple', textStartX, headerY, { align: 'left' });
      } else {
        // Company name next to logo
        doc.fontSize(24)
          .font('Helvetica-Bold')
          .fillColor('#00FF00')
          .text('DietTemple', textStartX, headerY + 20, { align: 'left' });
      }

      // Invoice Title
      doc.fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('FACTURE', textStartX, headerY + (hasLogo ? 50 : 30), { align: 'left' })
        .moveDown(1);

      // Company Info
      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text('Adresse: Tunis, Tunisie', textStartX, doc.y, { align: 'left' });
      doc.text('Email: contact@diettemple.tn', textStartX, doc.y, { align: 'left' });
      doc.text('Téléphone: +216 XX XXX XXX', textStartX, doc.y, { align: 'left' })
        .moveDown(2);

      // Order Info Section
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Informations de la commande', 50, doc.y, { underline: true })
        .moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#333333');
      
      const infoY = doc.y;
      doc.text(`Référence: ${order.reference}`, 50, infoY);
      doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`, 50, infoY + 15);
      
      if (order.status) {
        const statusLabel = order.status === 'confirmed' ? 'Confirmée' :
          order.status === 'pending' ? 'En attente' :
          order.status === 'shipped' ? 'Expédiée' :
          order.status === 'delivered' ? 'Livrée' :
          order.status === 'cancelled' ? 'Annulée' : order.status;
        doc.text(`Statut: ${statusLabel}`, 50, infoY + 30);
      }
      
      doc.moveDown(1.5);

      // Delivery Address Section
      if (order.deliveryAddress) {
        doc.fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#000000')
          .text('Adresse de livraison', 50, doc.y, { underline: true })
          .moveDown(0.5);

        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#333333')
          .text(order.deliveryAddress.fullName, 50, doc.y)
          .text(order.deliveryAddress.street, 50, doc.y)
          .text(`${order.deliveryAddress.city}, ${order.deliveryAddress.delegation}`, 50, doc.y)
          .text(`Téléphone: ${order.deliveryAddress.phone}`, 50, doc.y)
          .text(`Email: ${order.deliveryAddress.email}`, 50, doc.y)
          .moveDown(1.5);
      }

      // Items Table Section
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Articles commandés', 50, doc.y, { underline: true })
        .moveDown(0.5);

      // Table Header with background
      const tableTop = doc.y;
      doc.rect(50, tableTop, 500, 25)
        .fillColor('#00FF00')
        .fill()
        .fillColor('#000000');

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Produit', 60, tableTop + 8);
      doc.text('Qté', 320, tableTop + 8);
      doc.text('Prix unit.', 380, tableTop + 8);
      doc.text('Total', 480, tableTop + 8);

      // Table Rows with alternating background
      let y = tableTop + 25;
      order.items.forEach((item, index) => {
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(50, y, 500, 25)
            .fillColor('#F5F5F5')
            .fill()
            .fillColor('#000000');
        }

        doc.fontSize(9)
          .font('Helvetica')
          .fillColor('#333333')
          .text(item.name, 60, y + 8, { width: 250, ellipsis: true });
        doc.text(item.quantity.toString(), 320, y + 8);
        doc.text(`${item.price.toFixed(2)} DT`, 380, y + 8);
        doc.font('Helvetica-Bold')
          .text(`${(item.price * item.quantity).toFixed(2)} DT`, 480, y + 8);
        
        y += 25;
      });

      // Totals Section
      y += 15;
      doc.moveTo(50, y).lineTo(550, y).strokeColor('#CCCCCC').stroke();
      y += 15;

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#333333')
        .text('Sous-total:', 380, y);
      doc.text(`${order.subtotal.toFixed(2)} DT`, 480, y);
      y += 20;

      if (order.discount > 0) {
        doc.text('Réduction:', 380, y);
        doc.fillColor('#FF0000')
          .text(`-${order.discount.toFixed(2)} DT`, 480, y)
          .fillColor('#333333');
        y += 20;
      }

      doc.text('Frais de livraison:', 380, y);
      doc.text(`${order.deliveryFee.toFixed(2)} DT`, 480, y);
      y += 20;

      // Total with emphasis
      doc.moveTo(50, y).lineTo(550, y).strokeColor('#000000').lineWidth(2).stroke();
      y += 15;

      doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text('Total:', 380, y);
      doc.fontSize(16)
        .text(`${order.totalPrice.toFixed(2)} DT`, 480, y);

      // Payment Method Section
      y += 40;
      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#333333');
      
      const paymentMethodLabel = order.paymentMethod === 'CASH_ON_DELIVERY' ? 'Paiement à la livraison' :
        order.paymentMethod === 'CLICKTOPAY' ? 'ClickToPay' :
        order.paymentMethod === 'd17' ? 'D17' :
        order.paymentMethod === 'flouci' ? 'Flouci' :
        order.paymentMethod === 'paymee' ? 'Paymee' :
        'Non spécifié';
      
      doc.text(`Mode de paiement: ${paymentMethodLabel}`, 50, y);
      
      if (order.paymentStatus) {
        const paymentStatusLabel = order.paymentStatus === 'PAID' ? 'Payé' :
          order.paymentStatus === 'PENDING' ? 'En attente' :
          order.paymentStatus === 'FAILED' ? 'Échoué' : order.paymentStatus;
        doc.text(`Statut du paiement: ${paymentStatusLabel}`, 50, y + 15);
      }

      // Footer
      const pageHeight = doc.page.height;
      doc.fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor('#666666')
        .text('Merci pour votre achat!', 50, pageHeight - 60, { 
          align: 'center',
          width: 500 
        })
        .text('DietTemple - Votre partenaire nutrition', 50, pageHeight - 45, {
          align: 'center',
          width: 500
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
