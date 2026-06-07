/**
 * Calculate delivery fee based on business rules
 * This is the SINGLE SOURCE OF TRUTH for delivery fees
 * 
 * Rule: 7 DT if subtotal < 200 DT, otherwise 0 DT
 */
export function calculateDeliveryFee(subtotal: number): number {
  // Delivery fee is 7 DT if subtotal is less than 200 DT
  return subtotal < 200 ? 7 : 0;
}

/**
 * Calculate cart totals (subtotal, delivery fee, total)
 */
export function calculateCartTotals(
  items: Array<{ productId: any; quantity: number }>
): { subtotal: number; deliveryFee: number; total: number } {
  let subtotal = 0;

  for (const item of items) {
    const product = item.productId;
    if (!product || !product.price) continue;

    const itemPrice = product.discount
      ? product.price * (1 - product.discount / 100)
      : product.price;

    subtotal += itemPrice * item.quantity;
  }

  const deliveryFee = calculateDeliveryFee(subtotal);
  const total = subtotal + deliveryFee;

  return { subtotal, deliveryFee, total };
}


