# Product Seed Script

This script seeds the MongoDB database with realistic product data for the DietTemple boutique.

## Products Included

The seed script includes **30 realistic products** across the following categories:

### Proteins
- **Whey Protein**: 1 product
- **Whey Isolate**: 3 products
- **Vegan Protein**: 3 products
- **Mass Gainer**: 3 products

### Amino Acids
- **BCAA**: 2 products
- **EAA**: 2 products
- **Glutamine**: 2 products

### Performance
- **Creatine**: 3 products
- **Pre-Workout**: 3 products

### Wellness
- **Multivitamins**: 3 products
- **Omega 3**: 2 products
- **Fat Burners**: 3 products

## Usage

### Prerequisites
1. MongoDB must be running and accessible
2. Environment variables must be set (`.env` file with `MONGODB_URI`)

### Run the Seed Script

```bash
cd backend
npm install  # Install dependencies including ts-node
npm run seed:products
```

### What the Script Does

1. **Connects to MongoDB** using the `MONGODB_URI` from your `.env` file
2. **Clears existing products** (deletes all products from the database)
3. **Inserts 30 new products** with complete data including:
   - Name, brand, category, description
   - Composition (protein, calories, carbs, fat, amino acids)
   - Flavors array
   - Weight
   - Price (in TND)
   - Discount percentage
   - Product images
   - Stock quantity
   - Featured status
   - Tags

4. **Displays a summary** showing:
   - Product count per category
   - Total featured products
   - Total products inserted

## Product Data Structure

Each product includes:
- **Realistic brand names**: Optimum Nutrition, Dymatize, BSN, Scivation, Myprotein, etc.
- **Market-ready product names**: Not demo/fake names
- **Complete nutrition information**: All composition details provided
- **Multiple flavors**: Each protein product has 3-5 flavor options
- **Realistic prices**: TND pricing appropriate for Tunisia market
- **Product images**: Currently using generic supplement images (should be replaced with actual product images)
- **Stock levels**: Varying stock quantities
- **Featured products**: Some products marked as featured

## Image URLs

⚠️ **Note**: The seed script currently uses generic supplement images from Unsplash. These images load correctly but should be replaced with actual product images for production:

- Official brand product images
- Images from Cloudinary/Firebase Storage
- Product CDN URLs

Update the `images` array in `seedProducts.ts` with actual product image URLs before deploying to production.

## Re-seeding

The script clears all existing products before seeding. To re-seed the database:

```bash
npm run seed:products
```

This will delete all existing products and insert fresh data.


