import mongoose, { Schema, Document } from 'mongoose';
import { generateOrderReference } from '../utils/order.utils';

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface IOrder extends Document {
  userId?: mongoose.Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalPrice: number;
  status: 'pending' | 'pending_payment' | 'paid' | 'failed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  deliveryAddress?: {
    fullName: string;
    street: string;
    city: string;
    delegation: string;
    phone: string;
    email: string;
  };
  paymentMethod: 'CASH_ON_DELIVERY' | 'CLICKTOPAY' | null;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  paymentReference?: string;
  clickToPay?: {
    paymentId: string;
    reference: string;
    status: string;
  };
  promoCode?: string;
  reference: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema: Schema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    image: String,
  },
  { _id: false }
);

const OrderSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'pending_payment', 'paid', 'failed', 'confirmed', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    deliveryAddress: {
      fullName: String,
      street: String,
      city: String,
      delegation: String,
      phone: String,
      email: String,
    },
    paymentMethod: {
      type: String,
      enum: ['CASH_ON_DELIVERY', 'CLICKTOPAY', null],
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    paymentReference: String,
    clickToPay: {
      paymentId: String,
      reference: String,
      status: String,
    },
    promoCode: String,
    reference: {
      type: String,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate reference before saving
OrderSchema.pre('save', async function (next) {
  if (!this.reference) {
    this.reference = generateOrderReference();
  }
  next();
});

export default mongoose.model<IOrder>('Order', OrderSchema);

