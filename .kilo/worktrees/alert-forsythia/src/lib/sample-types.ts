/**
 * sample-types.ts — what has to be collected for a test.
 *
 * A short list rather than free text, because the collection screen groups by
 * it and two spellings of "Blood" would be two groups. Empty is a real and
 * common value: a consultation and an ultrasound collect nothing, and saying
 * so with a blank is more honest than forcing a "None" that then has to be
 * filtered out everywhere.
 *
 * Not a CHECK constraint in the database, deliberately (0015). The day a
 * laboratory asks for something not on this list, that must be a typing change
 * and not a migration.
 */
export const SAMPLE_TYPES = [
  "Blood",
  "Urine",
  "Stool",
  "Swab",
  "Sputum",
  "Semen",
  "Fluid",
  "Tissue",
] as const;

export type SampleType = (typeof SAMPLE_TYPES)[number] | "";
