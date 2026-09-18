import mongoose from 'mongoose';
import Product, { IProduct } from '../models/Product.model';
import StockMovement, { IStockMovement, StockMovementType } from '../models/StockMovement.model';
import { IOrder } from '../models/Order.model';

export interface StockAdjustmentInput {
  productId: string | mongoose.Types.ObjectId;
  newQuantity: number;
  reason?: string;
  performedBy?: string | mongoose.Types.ObjectId;
}

/**
 * Record a single stock movement audit entry.
 */
export async function recordStockMovement(data: {
  productId: string | mongoose.Types.ObjectId;
  orderId?: string | mongoose.Types.ObjectId;
  type: StockMovementType;
  previousQuantity: number;
  quantityChange: number;
  newQuantity: number;
  reason?: string;
  performedBy?: string | mongoose.Types.ObjectId;
}): Promise<IStockMovement> {
  const movement = new StockMovement({
    productId: data.productId,
    orderId: data.orderId,
    type: data.type,
    previousQuantity: data.previousQuantity,
    quantityChange: data.quantityChange,
    newQuantity: data.newQuantity,
    reason: data.reason || 'Ajustement de stock',
    performedBy: data.performedBy,
  });
  return await movement.save();
}

/**
 * Manually adjust product stock from the Admin / Employee dashboard.
 */
export async function adjustProductStock(
  input: StockAdjustmentInput
): Promise<{ product: IProduct; movement: IStockMovement | null }> {
  const product = await Product.findById(input.productId);
  if (!product) {
    throw new Error('Produit introuvable');
  }

  const previousQuantity = product.stock || 0;
  const newQuantity = Math.max(0, Math.floor(input.newQuantity));
  const quantityChange = newQuantity - previousQuantity;

  product.stock = newQuantity;
  await product.save();

  let movement: IStockMovement | null = null;
  if (quantityChange !== 0) {
    movement = await recordStockMovement({
      productId: product._id as mongoose.Types.ObjectId,
      type: 'adjustment',
      previousQuantity,
      quantityChange,
      newQuantity,
      reason: input.reason || 'Ajustement manuel',
      performedBy: input.performedBy,
    });
  }

  return { product, movement };
}

/**
 * Record order stock deduction in stock movements.
 * Called when an order is created or confirmed (idempotent).
 */
export async function handleOrderStockDeduction(order: IOrder): Promise<void> {
  if (!order || !order.items || !Array.isArray(order.items)) return;

  for (const item of order.items) {
    if (!item.productId || !item.quantity) continue;

    // Check idempotency: did we already record an 'order' movement for this item and order?
    const existing = await StockMovement.findOne({
      orderId: order._id,
      productId: item.productId,
      type: 'order',
    });

    if (existing) continue;

    const product = await Product.findById(item.productId);
    const currentStock = product?.stock ?? 0;
    const previousQuantity = currentStock + item.quantity;

    await recordStockMovement({
      productId: item.productId,
      orderId: order._id as mongoose.Types.ObjectId,
      type: 'order',
      previousQuantity,
      quantityChange: -item.quantity,
      newQuantity: currentStock,
      reason: `Commande #${order.reference || String(order._id).slice(-6).toUpperCase()}`,
    });
  }
}

/**
 * Restore product stock when an order is cancelled before fulfillment.
 * Idempotent: will not restore stock more than once for the same order.
 */
export async function handleOrderStockRestoration(
  order: IOrder,
  reason?: string,
  performedBy?: string | mongoose.Types.ObjectId
): Promise<void> {
  if (!order || !order.items || !Array.isArray(order.items)) return;

  for (const item of order.items) {
    if (!item.productId || !item.quantity) continue;

    // Check idempotency: did we already restore stock for this order item?
    const alreadyRestored = await StockMovement.findOne({
      orderId: order._id,
      productId: item.productId,
      type: 'cancellation',
    });

    if (alreadyRestored) continue;

    const product = await Product.findById(item.productId);
    if (!product) continue;

    const previousQuantity = product.stock || 0;
    const newQuantity = previousQuantity + item.quantity;

    product.stock = newQuantity;
    await product.save();

    await recordStockMovement({
      productId: item.productId,
      orderId: order._id as mongoose.Types.ObjectId,
      type: 'cancellation',
      previousQuantity,
      quantityChange: +item.quantity,
      newQuantity,
      reason: reason || `Annulation commande #${order.reference || String(order._id).slice(-6).toUpperCase()}`,
      performedBy,
    });
  }
}
