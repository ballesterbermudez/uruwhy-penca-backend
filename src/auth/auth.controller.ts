import { Controller, Get, Logger, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CookieOptions } from 'express';
import type { Request } from 'express';
import type { Response } from 'express';
import { buildFrontendRedirectUrl, resolveRedirectPathDetailsFromRequest } from './auth-redirect.util';
import { DiscordAuthGuard } from './discord-auth.guard';
import { encodeSessionUserForTransport, parseSessionUserFromCookie, parseSessionUserFromTransport } from './session-user.util';

const getSessionCookieOptions = (): CookieOptions => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

const resolveBackendCookieDomain = (): string | undefined => {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    return undefined;
  }

  try {
    return new URL(backendUrl).hostname;
  } catch {
    return undefined;
  }
};

const resolveCookieDomains = (req: Request): Array<string | undefined> => {
  const requestHost = req.hostname?.trim() || undefined;
  const backendDomain = resolveBackendCookieDomain();

  return [undefined, requestHost, backendDomain].filter((value, index, self) => self.indexOf(value) === index);
};

const clearCookieEverywhere = (req: Request, res: Response, name: string) => {
  const domains = resolveCookieDomains(req);
  const expiredDate = new Date(0);
  const sameSiteVariants: Array<CookieOptions['sameSite']> = ['lax', 'none'];
  const secureVariants = [false, true];

  domains.forEach((domain) => {
    sameSiteVariants.forEach((sameSite) => {
      secureVariants.forEach((secure) => {
        const options: CookieOptions = {
          httpOnly: true,
          path: '/',
          sameSite,
          secure,
          ...(domain ? { domain } : {}),
        };

        res.clearCookie(name, options);
        res.cookie(name, '', {
          ...options,
          expires: expiredDate,
          maxAge: 0,
        });
      });
    });
  });
};

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  // 🔥 redirect a Discord
  @Get('discord')
  @UseGuards(DiscordAuthGuard)
  async discordLogin() {
    // no hace nada, redirige automáticamente
  }

  // 🔥 callback de Discord
  @Get('discord/callback')
  @UseGuards(AuthGuard('discord'))
  async discordCallback(@Req() req: Request & { user?: unknown }, @Res() res: Response) {
    const redirectDetails = resolveRedirectPathDetailsFromRequest(req);
    const redirectPath = redirectDetails.redirectPath;

    if (process.env.AUTH_REDIRECT_DEBUG === 'true') {
      this.logger.log(
        `OAuth callback redirect source=${redirectDetails.source} reason=${redirectDetails.reason} path=${redirectPath} state=${JSON.stringify(req.query?.state)} redirectTo=${JSON.stringify(req.query?.redirectTo)} referer=${JSON.stringify(req.get('referer'))} frontendOrigin=${JSON.stringify(redirectDetails.frontendOrigin)}`,
      );
    }

    const user = req.user as { discordId?: unknown; username?: unknown; avatar?: unknown } | undefined;
    const sessionUser = {
      discordId: typeof user?.discordId === 'string' ? user.discordId : '',
      username: typeof user?.username === 'string' ? user.username : '',
      avatar: typeof user?.avatar === 'string' ? user.avatar : '',
    };

    if (!sessionUser.discordId || !sessionUser.username) {
      const targetUrl = buildFrontendRedirectUrl(redirectPath);

      if (process.env.AUTH_REDIRECT_DEBUG === 'true') {
        this.logger.warn(`OAuth callback missing user, redirecting to ${targetUrl}`);
      }

      res.redirect(targetUrl);
      return;
    }

    // Guardar info del usuario en la cookie.
    res.cookie('penca-session', JSON.stringify(sessionUser), getSessionCookieOptions());

    // Fallback para navegadores que bloquean cookies de terceros (ej. Safari iOS).
    const encodedSession = encodeSessionUserForTransport(sessionUser);
    const targetUrl = buildFrontendRedirectUrl(redirectPath, encodedSession);

    if (process.env.AUTH_REDIRECT_DEBUG === 'true') {
      this.logger.log(`OAuth callback success, redirecting discordId=${sessionUser.discordId} to ${targetUrl}`);
    }

    res.redirect(targetUrl);
  }

  // 👀 ver usuario logueado
  @Get('me')
  getMe(@Req() req: Request) {
    const cookieUser = parseSessionUserFromCookie(req.cookies?.['penca-session']);

    if (cookieUser) {
      return { user: cookieUser };
    }

    const headerUser = parseSessionUserFromTransport(req.get('x-penca-session'));

    if (headerUser) {
      return { user: headerUser };
    }

    return { user: null };
  }

  // 🚪 logout
  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    await new Promise<void>((resolve) => {
      req.logout((error) => {
        if (error) {
          resolve();
          return;
        }

        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      const sessionRequest = req as Request & { session?: { destroy: (callback: (error?: unknown) => void) => void } };

      if (!sessionRequest.session) {
        resolve();
        return;
      }

      sessionRequest.session.destroy(() => resolve());
    });

    clearCookieEverywhere(req, res, 'penca-session');
    clearCookieEverywhere(req, res, 'connect.sid');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({ message: 'Logged out' });
  }
}