import { orderEmailHtml, orderEmailText } from './orderEmailTemplate';
import { sendOrderConfirmationEmail } from './email.service';
import nodemailer from 'nodemailer';
import type { IOrder } from '../models/Order.model';
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: jest.fn(() => ({ verify: jest.fn(), sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }) })) } }));
const order = { reference: 'DT-TEST', subtotal: 100, discount: 10, deliveryFee: 7, totalPrice: 97, paymentStatus: 'PENDING', items: [{ name: '<script>alert(1)</script>', quantity: 2, price: 50 }], deliveryAddress: { fullName: 'Client <Test>', street: '12 rue du Test\nTunis 1000', phone: '20123456', email: 'test@example.com' } } as IOrder;
test('renders full address without missing legacy fields and escapes customer and product content', () => {
  const html = orderEmailHtml(order);
  expect(html).toContain('Client &lt;Test&gt;');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('undefined');
  expect(html).toContain('Tunis 1000');
  expect(html).toContain('97,00 DT');
  expect(html).toContain('en attente');
  expect(orderEmailText(order)).toContain('Total : 97,00 DT');
});
test('sends customer HTML and plain-text confirmation through configured transport', async () => {
  await sendOrderConfirmationEmail(order);
  const transport = (nodemailer.createTransport as jest.Mock).mock.results[0].value;
  expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'test@example.com', subject: expect.stringContaining('DT-TEST'), html: expect.stringContaining('Votre commande'), text: expect.stringContaining('97,00 DT'), replyTo: expect.any(String) }));
});
