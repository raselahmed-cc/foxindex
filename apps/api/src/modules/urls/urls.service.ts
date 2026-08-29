import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/errors/app-error';
import { UrlsRepository } from './urls.repository';

@Injectable()
export class UrlsService {
  constructor(@Inject(UrlsRepository) private readonly repository: UrlsRepository) {}

  findAllForProject(projectId: string) {
    return this.repository.findAllForProject(projectId);
  }

  async findOne(projectId: string, urlId: string) {
    const url = await this.repository.findByIdForProject(projectId, urlId);
    if (!url) throw new NotFoundError('URL');
    return url;
  }
}
