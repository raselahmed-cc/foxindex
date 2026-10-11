import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticationError } from '../../common/errors/app-error';
import { AttachmentsService, MAX_UPLOAD_BYTES, type UploadedFile as UploadedFileShape } from './attachments.service';

@Controller('attachments')
export class FilesController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthenticatedRequest['user'], @UploadedFile() file: UploadedFileShape) {
    return this.attachments.upload(user.id, file);
  }

  /** Public but signature-gated: only URLs the API handed to a participant work, and only for an hour. */
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!this.attachments.verify(id, Number(exp), sig)) throw new AuthenticationError('Link expired — reload the page');
    const { row, stream, size } = await this.attachments.open(id);
    const inline = row.mimeType.startsWith('image/') || row.mimeType === 'application/pdf';
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Length', String(size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
    stream.pipe(res);
  }
}
