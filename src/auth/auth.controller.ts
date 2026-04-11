import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CookieOptions } from 'express';
import type { Request } from 'express';
import type { Response } from 'express';

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

const resolveFrontendUrl = (): string => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (frontendUrl) {
    return trimTrailingSlash(frontendUrl);
  }

  return 'http://localhost:4321';
};

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

  // 🔥 redirect a Discord
  @Get('discord')
  @UseGuards(AuthGuard('discord'))
  async discordLogin() {
    // no hace nada, redirige automáticamente
  }

  // 🔥 callback de Discord
  @Get('discord/callback')
  @UseGuards(AuthGuard('discord'))
  async discordCallback(@Req() req, @Res() res: Response) {
    // Guardar info del usuario en la cookie
    res.cookie('penca-session', JSON.stringify(req.user), getSessionCookieOptions());
    
    // Redirect to frontend home
    res.redirect(resolveFrontendUrl());
  }

  // 👀 ver usuario logueado
  @Get('me')
  getMe(@Req() req) {
    const session = req.cookies['penca-session'];
    if (!session) {
      return { user: null };
    }
    try {
      const user = JSON.parse(session);
      return { user };
    } catch (e) {
      return { user: null };
    }
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