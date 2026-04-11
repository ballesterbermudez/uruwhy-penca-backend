import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldcupController } from './worldcup.controller';
import { WorldcupService } from './worldcup.service';
import { OfficialResult, OfficialResultSchema } from './schemas/official-result.schema';
import { Prediction, PredictionSchema } from './schemas/prediction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prediction.name, schema: PredictionSchema },
      { name: OfficialResult.name, schema: OfficialResultSchema },
    ]),
  ],
  controllers: [WorldcupController],
  providers: [WorldcupService],
})
export class WorldcupModule {}