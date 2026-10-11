import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  batchListQuerySchema,
  createBatchSchema,
  renameBatchSchema,
  type BatchListQuery,
  type CreateBatchInput,
  type RenameBatchInput,
} from '@foxindex/validation';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BatchesService } from './batches.service';

@Controller('batches')
@UseGuards(AuthGuard)
export class BatchesController {
  constructor(@Inject(BatchesService) private readonly batches: BatchesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedRequest['user'], @Body(new ZodValidationPipe(createBatchSchema)) body: CreateBatchInput) {
    return this.batches.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user'], @Query(new ZodValidationPipe(batchListQuerySchema)) query: BatchListQuery) {
    return this.batches.list(user.id, query);
  }

  @Get(':batchId')
  get(@CurrentUser() user: AuthenticatedRequest['user'], @Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.batches.get(user.id, batchId);
  }

  @Patch(':batchId')
  rename(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodValidationPipe(renameBatchSchema)) body: RenameBatchInput,
  ) {
    return this.batches.rename(user.id, batchId, body.name);
  }
}
