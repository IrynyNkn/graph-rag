export class PdfWithoutTextError extends Error {
  constructor() {
    super(
      'The PDF has no text layer. Scanned documents are not supported, because there is no OCR',
    );
    this.name = 'PdfWithoutTextError';
  }
}
