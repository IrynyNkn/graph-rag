import { z } from 'zod';

export const JobQueues = {
  indexDocument: 'documents.index',
  removeDocument: 'documents.remove',
} as const;

export const documentJobSchema = z.object({
  documentId: z.uuid(),
});
export type DocumentJob = z.infer<typeof documentJobSchema>;
