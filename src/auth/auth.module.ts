import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DiscordStrategy } from './discord.strategy';
import { PassportModule } from '@nestjs/passport';
import { SessionSerializer } from './serializer';
import { DiscordAuthGuard } from './discord-auth.guard';

@Module({
  imports: [PassportModule.register({ session: true })],
  controllers: [AuthController],
  providers: [AuthService, DiscordStrategy, SessionSerializer, DiscordAuthGuard],
})
export class AuthModule {}