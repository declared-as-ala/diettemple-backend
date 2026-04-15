import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  brand: string;
  category: string;
  description: string;
  composition: {
    protein?: string;
    calories?: string;
    carbs?: string;
    fat?: string;
    aminoAcids?: string;
  };
  flavors: string[];
  weight: string;
  price: number;
  discount?: number;
  /** UH Premium price — only for users with an ACTIVE subscription. Must be <= price. */
  uhPrice?: number | null;
  /** If true, only UH subscribed users see this product */
  isUhExclusive?: boolean;
  images: string[];
  stock: number;
  isFeatured: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    composition: {
      protein: String,
      calories: String,
      carbs: String,
      fat: String,
      aminoAcids: String,
    },
    flavors: {
      type: [String],
      default: [],
    },
    weight: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    uhPrice: {
      type: Number,
      min: 0,
      default: null,
      validate: {
        validator: function (this: any, val: number | null) {
          if (val === null || val === undefined) return true;
          return val <= this.price;
        },
        message: 'uhPrice must be less than or equal to price',
      },
    },
    isUhExclusive: {
      type: Boolean,
      default: false,
      index: true,
    },
    images: {
      type: [String],
      default: [],
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Index for search
ProductSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<IProduct>('Product', ProductSchema);

