import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Product from '../models/Product.model';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

/**
 * NOTE: Image URLs use diverse supplement/product images from Unsplash.
 * For production, these should be replaced with actual product images from:
 * - Official brand websites
 * - Cloudinary/Firebase Storage  
 * - Product CDN
 * Each product now has unique images to better represent different supplement types.
 */

// Realistic product data for DietTemple boutique
const products =[  {
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6 Pounds',
  price: 314,
  discount: 6,
  images: [
    'https://m.media-amazon.com/images/I/71YmthhE0ML._AC_UL320_.jpg',
  ],
  stock: 11,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Nutricost Mass Gainer Double Chocolate Flavor',
  brand: 'Nutricost',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Nutricost. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Double Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6.7 Pounds',
  price: 313,
  images: [
    'https://m.media-amazon.com/images/I/71tI5yuzyvL._AC_UL320_.jpg',
  ],
  stock: 58,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Nutricost Mass Gainer Cookies N Cream',
  brand: 'Nutricost',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Nutricost. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Cookies N Cream', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6.9 Pounds',
  price: 338,
  images: [
    'https://m.media-amazon.com/images/I/71kK6L9HcxL._AC_UL320_.jpg',
  ],
  stock: 54,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'GNC Pro Performance Bulk 1340 Mass',
  brand: 'GNC',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from GNC. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Double Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 301,
  discount: 6,
  images: [
    'https://m.media-amazon.com/images/I/711lPoCfHtL._AC_UL320_.jpg',
  ],
  stock: 51,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 384,
  images: [
    'https://m.media-amazon.com/images/I/814o1QYGHDL._AC_UL320_.jpg',
  ],
  stock: 44,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'GNC AMP Mass XXX Clinically Proven',
  brand: 'GNC',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from GNC. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6 Pounds',
  price: 318,
  images: [
    'https://m.media-amazon.com/images/I/71N5WqNv6NL._AC_UL320_.jpg',
  ],
  stock: 47,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Mutant Mass Weight Gainer Protein Powder',
  brand: 'Mutant',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Mutant. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Strawberry Banana', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '15 Pounds',
  price: 426,
  discount: 15,
  images: [
    'https://m.media-amazon.com/images/I/71iZ0PT8znL._AC_UL320_.jpg',
  ],
  stock: 16,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Serious Mass Strawberry Weight Gain Protein Powder',
  brand: 'Serious Mass',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Serious Mass. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 418,
  images: [
    'https://m.media-amazon.com/images/I/712hh-bJ7OL._AC_UL320_.jpg',
  ],
  stock: 33,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'GNC Pro Performance Weight Gainer -',
  brand: 'GNC',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from GNC. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Double Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '2.5 Pounds',
  price: 286,
  images: [
    'https://m.media-amazon.com/images/I/51gQ4tRPYAL._AC_UL320_.jpg',
  ],
  stock: 54,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'GNC Pro Performance Bulk 1340 Mass',
  brand: 'GNC',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from GNC. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla Ice Cream', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 315,
  discount: 23,
  images: [
    'https://m.media-amazon.com/images/I/519Rn4o9HhL._AC_UL320_.jpg',
  ],
  stock: 20,
  isFeatured: true,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'BSN TRUE-MASS Weight Gainer Muscle Mass',
  brand: 'BSN',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from BSN. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla Ice Cream', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5.82 Pounds',
  price: 300,
  images: [
    'https://m.media-amazon.com/images/I/71rzblAlQJL._AC_UL320_.jpg',
  ],
  stock: 11,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Banana', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 429,
  images: [
    'https://m.media-amazon.com/images/I/51rbPkg3JyL._AC_UL320_.jpg',
  ],
  stock: 40,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Rule1 Mass Gainer - High-Calorie Weight',
  brand: 'Rule1',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Rule1. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 324,
  discount: 17,
  images: [
    'https://m.media-amazon.com/images/I/61EcGMut+IL._AC_UL320_.jpg',
  ],
  stock: 39,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'COLOSSAL LABS Muscle Whey Protein Flavored Protein',
  brand: 'COLOSSAL LABS',
  category: 'Whey Protein',
  description: 'High-quality whey protein powder from COLOSSAL LABS. Ideal for post-workout recovery and muscle building. Provides essential amino acids for optimal results.',
  composition: {
    protein: '24g per serving',
    calories: '120 calories',
    carbs: '3g',
    fat: '1.5g',
    aminoAcids: '5.5g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 273,
  images: [
    'https://m.media-amazon.com/images/I/81XYlY8EpqL._AC_UL320_.jpg',
  ],
  stock: 18,
  isFeatured: false,
  tags: ['post-workout', 'muscle-building', 'recovery']
},
{
  name: 'ALLMAX QUICKMASS Chocolate - 10 lb',
  brand: 'ALLMAX',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from ALLMAX. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '64g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '10 Pounds',
  price: 364,
  images: [
    'https://m.media-amazon.com/images/I/61mJV2a-RxL._AC_UL320_.jpg',
  ],
  stock: 19,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'MHP UYM XXXL 1350 Mass Building',
  brand: 'MHP',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from MHP. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Milk Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 300,
  discount: 15,
  images: [
    'https://m.media-amazon.com/images/I/81oKw3jimSL._AC_UL320_.jpg',
  ],
  stock: 11,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'G6 Sports Nutrition Mass Pro High Protein Mass',
  brand: 'G6 Sports Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from G6 Sports Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '64g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '7 Pounds',
  price: 348,
  images: [
    'https://m.media-amazon.com/images/I/81TRlb34DmL._AC_UL320_.jpg',
  ],
  stock: 10,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Ultimate Nutrition ISO Mass Xtreme Gainer Weight',
  brand: 'Ultimate Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Ultimate Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '60g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '10 Pounds',
  price: 369,
  images: [
    'https://m.media-amazon.com/images/I/713miFrZqqL._AC_UL320_.jpg',
  ],
  stock: 15,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Muscletech Whey Protein Powder (Strawberry',
  brand: 'Muscletech Whey',
  category: 'Whey Isolate',
  description: 'Pure whey protein isolate from Muscletech Whey. Fast-digesting and low in carbs and fat. Perfect for lean muscle building and rapid recovery.',
  composition: {
    protein: '30g per serving',
    calories: '110 calories',
    carbs: '1g',
    fat: '0.5g',
    aminoAcids: '5.7g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '4 Pounds',
  price: 258,
  discount: 15,
  images: [
    'https://m.media-amazon.com/images/I/812ch9i46AL._AC_UL320_.jpg',
  ],
  stock: 44,
  isFeatured: false,
  tags: ['fast-absorbing', 'isolate', 'lean']
},
{
  name: 'VMI Sports | Major Mass Lean Mass',
  brand: 'VMI Sports',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from VMI Sports. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Cinnamon Crunch', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '4 Pounds',
  price: 290,
  images: [
    'https://m.media-amazon.com/images/I/61eonl8WFmL._AC_UL320_.jpg',
  ],
  stock: 31,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Mass Gainer for Bulking | High Calorie',
  brand: 'Mass Gainer',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Mass Gainer. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Cookies & Cream', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '15 Pounds',
  price: 426,
  images: [
    'https://m.media-amazon.com/images/I/71xwbTGuHVL._AC_UL320_.jpg',
  ],
  stock: 59,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Nutricost Whey Protein Powder Unflavored',
  brand: 'Nutricost',
  category: 'Whey Protein',
  description: 'High-quality whey protein powder from Nutricost. Ideal for post-workout recovery and muscle building. Provides essential amino acids for optimal results.',
  composition: {
    protein: '24g per serving',
    calories: '120 calories',
    carbs: '3g',
    fat: '1.5g',
    aminoAcids: '5.5g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 207,
  discount: 12,
  images: [
    'https://m.media-amazon.com/images/I/71yL2Z5ytwL._AC_UL320_.jpg',
  ],
  stock: 53,
  isFeatured: false,
  tags: ['post-workout', 'muscle-building', 'recovery']
},
{
  name: 'MuscleTech Mass Gainer Mass-Tech Extreme 2000',
  brand: 'MuscleTech',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from MuscleTech. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 295,
  images: [
    'https://m.media-amazon.com/images/I/51xRvvL1-YL._AC_UL320_.jpg',
  ],
  stock: 52,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Labrada Nutrition Muscle Mass Gainer Chocolate',
  brand: 'Labrada',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Labrada. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 417,
  images: [
    'https://m.media-amazon.com/images/I/81znSlLY2nL._AC_UL320_.jpg',
  ],
  stock: 53,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Dymatize Super Mass Gainer Protein Powder',
  brand: 'Dymatize',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Dymatize. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '52g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Gourmet Vanilla', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 279,
  discount: 20,
  images: [
    'https://m.media-amazon.com/images/I/81gq678bzQL._AC_UL320_.jpg',
  ],
  stock: 45,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 381,
  images: [
    'https://m.media-amazon.com/images/I/71HjvVnPj5L._AC_UL320_.jpg',
  ],
  stock: 43,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 383,
  images: [
    'https://m.media-amazon.com/images/I/510JUtwvEyL._AC_UL320_.jpg',
  ],
  stock: 22,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6 Pounds',
  price: 299,
  discount: 22,
  images: [
    'https://m.media-amazon.com/images/I/71g532r7GpL._AC_UL320_.jpg',
  ],
  stock: 27,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Dymatize Super Mass Gainer Protein Powder',
  brand: 'Dymatize',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Dymatize. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '52g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Rich Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 318,
  images: [
    'https://m.media-amazon.com/images/I/81NOLPTQDAL._AC_UL320_.jpg',
  ],
  stock: 30,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Dymatize Super Mass Gainer Protein Powder',
  brand: 'Dymatize',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Dymatize. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '52g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Rich Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 320,
  images: [
    'https://m.media-amazon.com/images/I/81xl7Axf2jL._AC_UL320_.jpg',
  ],
  stock: 50,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Chocolate Peanut Butter', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6 Pounds',
  price: 326,
  discount: 10,
  images: [
    'https://m.media-amazon.com/images/I/71aBrpNU4lL._AC_UL320_.jpg',
  ],
  stock: 42,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'MuscleMeds CARNIVOR Mass Gainer Beef Protein',
  brand: 'MuscleMeds',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from MuscleMeds. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Chocolate Peanut Butter', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6 Pounds',
  price: 314,
  images: [
    'https://m.media-amazon.com/images/I/71ex2qtUK1L._AC_UL320_.jpg',
  ],
  stock: 38,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Dymatize Super Mass Gainer Protein Powder',
  brand: 'Dymatize',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Dymatize. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '52g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Rich Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6 Pounds',
  price: 336,
  images: [
    'https://m.media-amazon.com/images/I/51tbM5oWjNL._AC_UL320_.jpg',
  ],
  stock: 57,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Gold Standard Pro Gainer Weight',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla Custard', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5.09 Pounds',
  price: 281,
  discount: 16,
  images: [
    'https://m.media-amazon.com/images/I/71duchiUWiL._AC_UL320_.jpg',
  ],
  stock: 18,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Now Foods Sports Mass Gainer Protein Powder',
  brand: 'Now Foods',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Now Foods. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5.5 Pounds',
  price: 300,
  images: [
    'https://m.media-amazon.com/images/I/713tAtza7OL._AC_UL320_.jpg',
  ],
  stock: 51,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'GNC AMP Wheybolic Alpha Clinically Proven',
  brand: 'GNC',
  category: 'Whey Protein',
  description: 'High-quality whey protein powder from GNC. Ideal for post-workout recovery and muscle building. Provides essential amino acids for optimal results.',
  composition: {
    protein: '40g per serving',
    calories: '120 calories',
    carbs: '3g',
    fat: '1.5g',
    aminoAcids: '5.5g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 220,
  images: [
    'https://m.media-amazon.com/images/I/81tvbQUbYtL._AC_UL320_.jpg',
  ],
  stock: 12,
  isFeatured: false,
  tags: ['post-workout', 'muscle-building', 'recovery']
},
{
  name: 'Optimum Nutrition Gold Standard 100% Whey Protein',
  brand: 'Optimum Nutrition',
  category: 'Whey Protein',
  description: 'High-quality whey protein powder from Optimum Nutrition. Ideal for post-workout recovery and muscle building. Provides essential amino acids for optimal results.',
  composition: {
    protein: '24g per serving',
    calories: '120 calories',
    carbs: '3g',
    fat: '1.5g',
    aminoAcids: '5.5g BCAAs'
  },
  flavors: ['Rich Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 213,
  discount: 24,
  images: [
    'https://m.media-amazon.com/images/I/71f+UBXh2vL._AC_UL320_.jpg',
  ],
  stock: 27,
  isFeatured: false,
  tags: ['post-workout', 'muscle-building', 'recovery']
},
{
  name: '5% Nutrition Rich Piana Real Carbs',
  brand: '5% Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from 5% Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '3 Pounds',
  price: 260,
  images: [
    'https://m.media-amazon.com/images/I/61+wB8Z+UNL._AC_UL320_.jpg',
  ],
  stock: 52,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'GNC Pro Performance 100% Whey -',
  brand: 'GNC',
  category: 'Whey Protein',
  description: 'High-quality whey protein powder from GNC. Ideal for post-workout recovery and muscle building. Provides essential amino acids for optimal results.',
  composition: {
    protein: '24g per serving',
    calories: '120 calories',
    carbs: '3g',
    fat: '1.5g',
    aminoAcids: '5.5g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 206,
  images: [
    'https://m.media-amazon.com/images/I/61ZoKDRjucL._AC_UL320_.jpg',
  ],
  stock: 42,
  isFeatured: false,
  tags: ['post-workout', 'muscle-building', 'recovery']
},
{
  name: 'MUSCLEOLOGY Weight Gainer | Whey Protein',
  brand: 'MUSCLEOLOGY',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from MUSCLEOLOGY. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '6 Pounds',
  price: 338,
  discount: 9,
  images: [
    'https://m.media-amazon.com/images/I/61Px3kMFa8L._AC_UL320_.jpg',
  ],
  stock: 13,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'REDCON1 MRE Protein Powder Fudge Brownie',
  brand: 'REDCON1',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from REDCON1. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Fudge Brownie', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 277,
  images: [
    'https://m.media-amazon.com/images/I/61cjtJJuQhL._AC_UL320_.jpg',
  ],
  stock: 19,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Chocolate Peanut Butter', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 423,
  images: [
    'https://m.media-amazon.com/images/I/511yjH27xML._AC_UL320_.jpg',
  ],
  stock: 29,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Body Fortress 100% Whey Premium Protein Powder',
  brand: 'Body Fortress',
  category: 'Whey Protein',
  description: 'High-quality whey protein powder from Body Fortress. Ideal for post-workout recovery and muscle building. Provides essential amino acids for optimal results.',
  composition: {
    protein: '24g per serving',
    calories: '120 calories',
    carbs: '3g',
    fat: '1.5g',
    aminoAcids: '5.5g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '1.78 Pounds',
  price: 191,
  discount: 20,
  images: [
    'https://m.media-amazon.com/images/I/811Z-NuSnQL._AC_UL320_.jpg',
  ],
  stock: 10,
  isFeatured: false,
  tags: ['post-workout', 'muscle-building', 'recovery']
},
{
  name: 'PROVOSYN PROVOSYN. The Original Ultra-Premium',
  brand: 'PROVOSYN',
  category: 'Whey Protein',
  description: 'High-quality whey protein powder from PROVOSYN. Ideal for post-workout recovery and muscle building. Provides essential amino acids for optimal results.',
  composition: {
    protein: '24g per serving',
    calories: '120 calories',
    carbs: '3g',
    fat: '1.5g',
    aminoAcids: '5.5g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 205,
  images: [
    'https://m.media-amazon.com/images/I/71HY8meqhpL._AC_UL320_.jpg',
  ],
  stock: 20,
  isFeatured: false,
  tags: ['post-workout', 'muscle-building', 'recovery']
},
{
  name: 'Optimum Nutrition Serious Mass Weight Gainer Protein',
  brand: 'Optimum Nutrition',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from Optimum Nutrition. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Rich Chocolate', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 300,
  images: [
    'https://m.media-amazon.com/images/I/81U9o5K7UyL._AC_UL320_.jpg',
  ],
  stock: 27,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'Nutrex Research Whey Protein Powder Chocolate Muscle',
  brand: 'Nutrex Research',
  category: 'Whey Isolate',
  description: 'Pure whey protein isolate from Nutrex Research. Fast-digesting and low in carbs and fat. Perfect for lean muscle building and rapid recovery.',
  composition: {
    protein: '25g per serving',
    calories: '110 calories',
    carbs: '1g',
    fat: '0.5g',
    aminoAcids: '5.7g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 269,
  discount: 9,
  images: [
    'https://m.media-amazon.com/images/I/713Q8Rls3mL._AC_UL320_.jpg',
  ],
  stock: 48,
  isFeatured: false,
  tags: ['fast-absorbing', 'isolate', 'lean']
},
{
  name: 'BEYOND RAW Dynamic Gainer | High-Tech Mass',
  brand: 'BEYOND RAW',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from BEYOND RAW. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 298,
  images: [
    'https://m.media-amazon.com/images/I/61sfJkmkJTL._AC_UL320_.jpg',
  ],
  stock: 17,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'BODYTECH Prime Mass - High-Calorie Mass',
  brand: 'BODYTECH',
  category: 'Mass Gainer',
  description: 'Premium mass gainer protein powder from BODYTECH. High-calorie formula designed for weight gain and muscle building. Perfect for hard gainers looking to add size and strength.',
  composition: {
    protein: '50g per serving',
    calories: '1,250 calories',
    carbs: '250g',
    fat: '4.5g',
    aminoAcids: '11g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '12 Pounds',
  price: 408,
  images: [
    'https://m.media-amazon.com/images/I/61oT16sEmRL._AC_UL320_.jpg',
  ],
  stock: 47,
  isFeatured: false,
  tags: ['weight-gain', 'high-calorie', 'mass-building']
},
{
  name: 'High Protein Coffee Powder 25 Grams Whey',
  brand: 'High Protein',
  category: 'Whey Isolate',
  description: 'Pure whey protein isolate from High Protein. Fast-digesting and low in carbs and fat. Perfect for lean muscle building and rapid recovery.',
  composition: {
    protein: '25g per serving',
    calories: '110 calories',
    carbs: '1g',
    fat: '0.5g',
    aminoAcids: '5.7g BCAAs'
  },
  flavors: ['French Vanilla', 'Vanilla', 'Chocolate', 'Strawberry'],
  weight: '5 Pounds',
  price: 234,
  discount: 17,
  images: [
    'https://m.media-amazon.com/images/I/71dZUVQvYkL._AC_UL320_.jpg',
  ],
  stock: 37,
  isFeatured: false,
  tags: ['fast-absorbing', 'isolate', 'lean']
},
{
  name: 'Whey Protein Isolate - Dark Chocolate Flavor',
  brand: 'Whey Protein',
  category: 'Whey Isolate',
  description: 'Pure whey protein isolate from Whey Protein. Fast-digesting and low in carbs and fat. Perfect for lean muscle building and rapid recovery.',
  composition: {
    protein: '25g per serving',
    calories: '110 calories',
    carbs: '1g',
    fat: '0.5g',
    aminoAcids: '5.7g BCAAs'
  },
  flavors: ['Vanilla', 'Chocolate', 'Strawberry'],
  weight: '1 Pound',
  price: 197,
  images: [
    'https://m.media-amazon.com/images/I/71imSk7NXHL._AC_UL320_.jpg',
  ],
  stock: 46,
  isFeatured: false,
  tags: ['fast-absorbing', 'isolate', 'lean']
}
];

async function seedProducts() {
  try {
    // Connect to MongoDB
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing products
    console.log('🗑️  Clearing existing products...');
    await Product.deleteMany({});
    console.log('✅ Existing products cleared');

    // Insert new products
    console.log('📦 Inserting products...');
    const insertedProducts = await Product.insertMany(products);
    console.log(`✅ Successfully inserted ${insertedProducts.length} products`);

    // Display summary
    console.log('\n📊 Product Summary:');
    const categories = await Product.distinct('category');
    for (const category of categories) {
      const count = await Product.countDocuments({ category });
      console.log(`   ${category}: ${count} products`);
    }

    const featuredCount = await Product.countDocuments({ isFeatured: true });
    console.log(`\n⭐ Featured products: ${featuredCount}`);
    console.log(`💰 Total products: ${insertedProducts.length}`);

    console.log('\n✅ Product seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding products:', error);
    process.exit(1);
  }
}

// Run the seed function
seedProducts();

