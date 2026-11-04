import { z } from 'zod';

export const ENTITY_TYPES = [
  'PERSON',
  'ORGANIZATION',
  'TEAM',
  'SYSTEM',
  'PROJECT',
  'LOCATION',
  'EVENT',
  'WORK',
  'CONCEPT',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

const entitySchema = z.object({
  name: z.string(),
  type: z.enum(ENTITY_TYPES),
  description: z.string(),
});

const tripleSchema = z.object({
  subject: z.string(),
  relation: z.string(),
  object: z.string(),
});

export const extractionSchema = z.object({
  entities: z.array(entitySchema),
  triples: z.array(tripleSchema),
});

export type ExtractedEntity = z.infer<typeof entitySchema>;
export type ExtractedTriple = z.infer<typeof tripleSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
