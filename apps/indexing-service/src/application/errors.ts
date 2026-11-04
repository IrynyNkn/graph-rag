import type { DocumentStatus } from '@graph-rag/contracts';
import {
  ConflictError,
  InvalidInputError,
  NotFoundError,
  UnsupportedMediaError,
} from '@graph-rag/nest-common';

export class DocumentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Document ${id} does not exist`);
  }
}

export class DuplicateDocumentError extends ConflictError {
  constructor(name: string) {
    super(`A document with the same content as "${name}" already exists`);
  }
}

export class DocumentNotRetryableError extends ConflictError {
  constructor(status: DocumentStatus) {
    super(`A document in status "${status}" has nothing to retry`);
  }
}

export class EmptyDocumentError extends InvalidInputError {
  constructor(name: string) {
    super(`"${name}" is empty`);
  }
}

export class UnsupportedDocumentTypeError extends UnsupportedMediaError {
  constructor(name: string) {
    super(`"${name}" is not a supported document. Upload a PDF, TXT or MD file`);
  }
}
