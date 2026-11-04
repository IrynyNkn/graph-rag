import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDocuments,
  removeDocument,
  retryDocument,
  uploadDocument,
} from '../../api/documents-api';
import { errorMessage } from '../../api/http';
import { isInProgress } from './document-view';

const QUERY_KEY = ['documents'];
const POLL_INTERVAL_MS = 2000;

export function useDocuments() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: QUERY_KEY });

  const documents = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listDocuments,
    refetchInterval: (query) => (query.state.data?.some(isInProgress) ? POLL_INTERVAL_MS : false),
  });
  const upload = useMutation({ mutationFn: uploadAll, onSettled: refresh });
  const remove = useMutation({ mutationFn: removeDocument, onSettled: refresh });
  const retry = useMutation({ mutationFn: retryDocument, onSettled: refresh });

  const failure = documents.error ?? upload.error ?? remove.error ?? retry.error;
  return {
    documents: documents.data ?? [],
    isLoading: documents.isLoading,
    isUploading: upload.isPending,
    error: failure?.message ?? null,
    upload: upload.mutate,
    remove: remove.mutate,
    retry: retry.mutate,
  };
}

/** One rejected file should not stop the others from uploading. */
async function uploadAll(files: File[]): Promise<void> {
  const results = await Promise.allSettled(files.map(uploadDocument));
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [errorMessage(result.reason)] : [],
  );
  if (failures.length > 0) {
    throw new Error(failures.join(' '));
  }
}
