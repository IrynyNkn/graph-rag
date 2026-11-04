import type { Document } from '@graph-rag/contracts';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from '../application/documents.service.js';

interface UploadedDocumentFile {
  originalname: string;
  buffer: Buffer;
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(): Promise<Document[]> {
    return this.documents.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedDocumentFile | undefined): Promise<Document> {
    if (file === undefined) {
      throw new BadRequestException('Send the document in the "file" field');
    }
    return this.documents.upload({
      // Multer decodes the file name as Latin-1, while browsers send UTF-8.
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      content: file.buffer,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<Document> {
    return this.documents.requestRemoval(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retry(@Param('id', ParseUUIDPipe) id: string): Promise<Document> {
    return this.documents.retry(id);
  }
}
