import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

const resolveFrontendUrl = (): string => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (frontendUrl) {
    return trimTrailingSlash(frontendUrl);
  }

  return 'http://localhost:4321';
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
    res.cookie('penca-session', JSON.stringify(req.user), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });
    
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
  logout(@Res() res: Response): void {
    res.clearCookie('penca-session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ message: 'Logged out' });
  }
}