import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { WorldcupModule } from './worldcup/worldcup.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const uri = configService.get<string>('DB_URI');

        if (!uri) {
          throw new Error('DB_URI no esta definido en el archivo .env');
        }

        return {
          uri,
          dbName: configService.get<string>('DB_NAME') || 'penca',
        };
      },
    }),
    AuthModule,
    WorldcupModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
