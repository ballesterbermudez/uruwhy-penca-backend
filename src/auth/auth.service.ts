import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  validateUser(profile: any) {
    return {
      discordId: profile.id,
      username: profile.username,
      avatar: profile.avatar,
    };
  }
}