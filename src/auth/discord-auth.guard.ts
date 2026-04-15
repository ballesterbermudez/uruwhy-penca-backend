import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { resolveRedirectPathDetailsFromRequest } from './auth-redirect.util';

@Injectable()
export class DiscordAuthGuard extends AuthGuard('discord') {
  private readonly logger = new Logger(DiscordAuthGuard.name);

  override getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const details = resolveRedirectPathDetailsFromRequest(req);

    if (process.env.AUTH_REDIRECT_DEBUG === 'true') {
      this.logger.log(
        `OAuth init redirect source=${details.source} reason=${details.reason} path=${details.redirectPath} state=${JSON.stringify(req.query?.state)} redirectTo=${JSON.stringify(req.query?.redirectTo)} referer=${JSON.stringify(req.get('referer'))} frontendOrigin=${JSON.stringify(details.frontendOrigin)}`,
      );
    }

    return {
      state: details.redirectPath,
    };
  }
}