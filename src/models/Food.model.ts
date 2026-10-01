import mongoose, { Schema, Document } from 'mongoose';

/** A way to measure a food in a natural unit, with its gram equivalent (edible portion). */
export interface IServingUnit {
  /** Stable key: piece | slice | bowl | plate | serving | glass | cup | can | scoop | spoon | container | ml | g */
  unit: string;
  label: string;
  labelPlural?: string;
  /** Grams (or ml for liquids, density ≈ 1) in ONE of this unit. */
  grams: number;
  /** Increment used by the +/- stepper in the app. */
  step?: number;
}

export interface IFood extends Document {
  nameFr: string;
  nameAr?: string;
  nameEn?: string;
  /** Common/Tunisian dialect name (e.g. "Mlewi"). */
  nameLocal?: string;
  synonyms: string[];
  /** Normalised (lowercase, no accents) names + aliases, used for matching. Built by the seed/catalog. */
  searchKeys?: string[];
  cuisine?: string;
  macrosPer100g: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
  };
  defaultUnit?: string;
  servingUnits?: IServingUnit[];
  /** Typical small / medium / large portions in grams, for foods eaten "by plate". */
  portionPresets?: { small: number; medium: number; large: number };
  isDish?: boolean;
  /** Names of typical components of a composed dish (matched by name, never hardcoded in the app). */
  components?: string[];
  /** 'reference' = taken from a food composition table; 'estimated' = typical home-cooked average. */
  nutritionBasis?: 'reference' | 'estimated';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ServingUnitSchema = new Schema(
  {
    unit: { type: String, required: true },
    label: { type: String, required: true },
    labelPlural: { type: String },
    grams: { type: Number, required: true, min: 0 },
    step: { type: Number },
  },
  { _id: false }
);

const FoodSchema = new Schema(
  {
    nameFr: { type: String, required: true, index: true },
    nameAr: { type: String },
    nameEn: { type: String },
    nameLocal: { type: String },
    synonyms: [{ type: String }],
    searchKeys: [{ type: String, index: true }],
    cuisine: { type: String, index: true },
    macrosPer100g: {
      kcal: { type: Number, required: true },
      protein: { type: Number, required: true },
      carbs: { type: Number, required: true },
      fat: { type: Number, required: true },
      fiber: { type: Number },
    },
    defaultUnit: { type: String },
    servingUnits: { type: [ServingUnitSchema], default: undefined },
    portionPresets: {
      small: { type: Number },
      medium: { type: Number },
      large: { type: Number },
    },
    isDish: { type: Boolean },
    components: [{ type: String }],
    nutritionBasis: { type: String, enum: ['reference', 'estimated'] },
    tags: [{ type: String, index: true }],
  },
  { timestamps: true }
);

FoodSchema.index({ nameFr: 'text', synonyms: 'text' });

export default mongoose.model<IFood>('Food', FoodSchema);
