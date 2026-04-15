import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { resolveRedirectPathFromRequest } from './auth-redirect.util';

@Injectable()
export class DiscordAuthGuard extends AuthGuard('discord') {
  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();

    return {
      state: resolveRedirectPathFromRequest(req),
    };
  }
}