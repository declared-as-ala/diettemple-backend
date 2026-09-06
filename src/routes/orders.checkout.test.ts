import express from 'express';
import request from 'supertest';
import router from './orders.routes';
import Order from '../models/Order.model';
import Product from '../models/Product.model';
import { sendOrderEmails } from '../services/email.service';

jest.mock('../services/email.service', () => ({ sendOrderEmails: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/Order.model', () => ({ __esModule: true, default: jest.fn().mockImplementation(data => ({ ...data, _id: '507f1f77bcf86cd799439012', reference: 'DT-TEST', save: jest.fn().mockResolvedValue(undefined) })) }));
jest.mock('../models/Product.model', () => ({ __esModule: true, default: { findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) } }));
const app = express(); app.use(express.json()); app.use('/orders', router);
const address = { fullName: ' Test Client ', street: ' 12 rue du Test, Tunis 1000 ', email: ' test@example.com ', phone: '+216 20 123 456' };
const payload = { items: [{ productId: '507f1f77bcf86cd799439011', quantity: 2 }], deliveryAddress: address, subtotal: 1, total: 1 };
beforeEach(() => {
  jest.clearAllMocks();
  (Product.findById as jest.Mock).mockResolvedValue({ _id: payload.items[0].productId, name: 'Test whey', stock: 10, price: 50, images: [] });
});
test('four-field guest checkout saves a normalized full address, calculates prices, and triggers confirmation email', async () => {
  const response = await request(app).post('/orders/create').send(payload);
  expect(response.status).toBe(201);
  expect(response.body.order.deliveryAddress).toEqual({ fullName: 'Test Client', street: '12 rue du Test, Tunis 1000', email: 'test@example.com', phone: '+21620123456' });
  expect(response.body.order.totalPrice).toBe(107);
  await new Promise(resolve => setImmediate(resolve));
  expect(sendOrderEmails).toHaveBeenCalledTimes(1);
});
test.each([
  { fullName: ' ' }, { street: ' ' }, { email: 'bad' }, { phone: '123' },
])('rejects invalid contact data before touching stock: %j', async invalid => {
  const response = await request(app).post('/orders/create').send({ ...payload, deliveryAddress: { ...address, ...invalid } });
  expect(response.status).toBe(400);
  expect(Product.updateOne).not.toHaveBeenCalled();
  expect(Order).not.toHaveBeenCalled();
});
test('continues accepting older clients with separate city and delegation', async () => {
  const response = await request(app).post('/orders/create').send({ ...payload, deliveryAddress: { ...address, city: 'Tunis', delegation: 'Centre' } });
  expect(response.status).toBe(201);
  expect(response.body.order.deliveryAddress.city).toBe('Tunis');
});
