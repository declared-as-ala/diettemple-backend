import Product from '../models/Product.model';

/**
 * Convert string to URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD') // split accented characters
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // remove invalid chars
    .replace(/[\s_-]+/g, '-') // collapse whitespace and dashes
    .replace(/^-+|-+$/g, ''); // trim dashes
}

/**
 * Generate a unique slug for a product, ensuring no duplicate URL slugs.
 */
export async function generateUniqueProductSlug(
  name: string,
  excludeProductId?: string
): Promise<string> {
  const baseSlug = slugify(name) || 'produit';
  let candidateSlug = baseSlug;
  let counter = 1;

  while (true) {
    const query: any = { 'seo.slug': candidateSlug };
    if (excludeProductId) {
      query._id = { $ne: excludeProductId };
    }

    const exists = await Product.findOne(query).select('_id').lean();
    if (!exists) {
      return candidateSlug;
    }

    counter++;
    candidateSlug = `${baseSlug}-${counter}`;
  }
}
