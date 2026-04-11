import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-discord';
import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

const resolveCallbackUrl = (): string => {
  const explicitCallback = process.env.DISCORD_CALLBACK_URL;

  if (explicitCallback) {
    return trimTrailingSlash(explicitCallback);
  }

  const backendBaseUrl = process.env.BACKEND_URL;

  if (backendBaseUrl) {
    return `${trimTrailingSlash(backendBaseUrl)}/auth/discord/callback`;
  }

  return 'http://localhost:3000/auth/discord/callback';
};

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      callbackURL: resolveCallbackUrl(),
      scope: ['identify', 'email'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    return this.authService.validateUser(profile);
  }
}