import { Global, Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { FilesController } from './files.controller';
import { LocalDiskStorage, OBJECT_STORAGE } from './storage.service';

@Global()
@Module({
  controllers: [FilesController],
  providers: [AttachmentsService, { provide: OBJECT_STORAGE, useClass: LocalDiskStorage }],
  exports: [AttachmentsService],
})
export class FilesModule {}
