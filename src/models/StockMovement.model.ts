import mongoose, { Schema, Document } from 'mongoose';

export type StockMovementType = 'adjustment' | 'order' | 'cancellation' | 'return';

export interface IStockMovement extends Document {
  productId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  type: StockMovementType;
  previousQuantity: number;
  quantityChange: number;
  newQuantity: number;
  reason?: string;
  performedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StockMovementSchema: Schema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    type: {
      type: String,
      enum: ['adjustment', 'order', 'cancellation', 'return'],
      default: 'adjustment',
      required: true,
    },
    previousQuantity: {
      type: Number,
      required: true,
    },
    quantityChange: {
      type: Number,
      required: true,
    },
    newQuantity: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

StockMovementSchema.index({ productId: 1, createdAt: -1 });

export default mongoose.model<IStockMovement>('StockMovement', StockMovementSchema);
