import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
}

/** Every request gets a request_id — the thread that ties logs, traces, and the response envelope together. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    (req as RequestWithId).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
