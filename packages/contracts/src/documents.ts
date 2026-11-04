import { z } from 'zod';

export const documentStatusSchema = z.enum(['queued', 'indexing', 'indexed', 'failed', 'deleting']);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentFileTypeSchema = z.enum(['pdf', 'txt', 'md']);
export type DocumentFileType = z.infer<typeof documentFileTypeSchema>;

export const documentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: documentFileTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  status: documentStatusSchema,
  chunksTotal: z.number().int().nonnegative(),
  chunksDone: z.number().int().nonnegative(),
  chunksFailed: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Document = z.infer<typeof documentSchema>;
