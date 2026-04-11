import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DiscordStrategy } from './discord.strategy';
import { PassportModule } from '@nestjs/passport';
import { SessionSerializer } from './serializer';

@Module({
  imports: [PassportModule.register({ session: true })],
  controllers: [AuthController],
  providers: [AuthService, DiscordStrategy, SessionSerializer],
})
export class AuthModule {}