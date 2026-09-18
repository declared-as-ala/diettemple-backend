import mongoose, { Schema, Document } from 'mongoose';

export interface IProductMediaImage {
  key: string;
  bucket: string;
  url?: string;
  isPrimary: boolean;
  order: number;
  alt?: string;
}

export interface IProductSEO {
  title?: string;
  description?: string;
  slug?: string;
  keywords?: string[];
  canonical?: string;
  index?: boolean;
}

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

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
  /** Legacy array of image URLs kept synchronized with mediaImages for backward compatibility */
  images: string[];
  /** Structured MinIO product images */
  mediaImages: IProductMediaImage[];
  sku?: string;
  stock: number;
  trackStock: boolean;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  seo?: IProductSEO;
  isFeatured: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProductMediaImageSchema: Schema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    bucket: { type: String, default: 'media', trim: true },
    url: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    alt: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const ProductSEOSchema: Schema = new Schema(
  {
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    slug: { type: String, trim: true, lowercase: true },
    keywords: { type: [String], default: [] },
    canonical: { type: String, trim: true },
    index: { type: Boolean, default: true },
  },
  { _id: false }
);

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
    mediaImages: {
      type: [ProductMediaImageSchema],
      default: [],
    },
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    trackStock: {
      type: Boolean,
      default: true,
    },
    lowStockThreshold: {
      type: Number,
      min: 0,
      default: 5,
    },
    stockStatus: {
      type: String,
      enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'],
      default: 'IN_STOCK',
      index: true,
    },
    seo: {
      type: ProductSEOSchema,
      default: () => ({ index: true, keywords: [] }),
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

// Indexes
ProductSchema.index({ name: 'text', description: 'text' });
ProductSchema.index({ 'seo.slug': 1 }, { unique: true, sparse: true });

// Pre-save hook: auto-compute stockStatus and keep images array in sync
ProductSchema.pre<IProduct>('save', function (next) {
  // Compute stockStatus
  if (this.trackStock) {
    const threshold = typeof this.lowStockThreshold === 'number' ? this.lowStockThreshold : 5;
    if (this.stock <= 0) {
      this.stockStatus = 'OUT_OF_STOCK';
    } else if (this.stock <= threshold) {
      this.stockStatus = 'LOW_STOCK';
    } else {
      this.stockStatus = 'IN_STOCK';
    }
  }

  // Ensure mediaImages primary rule and synchronize images: string[]
  if (Array.isArray(this.mediaImages) && this.mediaImages.length > 0) {
    // Sort mediaImages by order
    this.mediaImages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Ensure exactly one isPrimary
    const hasPrimary = this.mediaImages.some((img) => img.isPrimary);
    if (!hasPrimary) {
      this.mediaImages[0].isPrimary = true;
    }

    // Keep legacy images array in sync (primary image first, followed by others)
    const primaryImg = this.mediaImages.find((img) => img.isPrimary);
    const otherImgs = this.mediaImages.filter((img) => !img.isPrimary);
    const ordered = primaryImg ? [primaryImg, ...otherImgs] : this.mediaImages;

    this.images = ordered
      .map((img) => img.url || (img.bucket && img.key ? `/${img.bucket}/${img.key}` : ''))
      .filter((url) => Boolean(url));
  }

  next();
});

export default mongoose.model<IProduct>('Product', ProductSchema);
