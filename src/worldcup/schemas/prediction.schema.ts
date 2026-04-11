import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type PredictionDocument = HydratedDocument<Prediction>;

@Schema({ collection: 'predictions', timestamps: true })
export class Prediction {
  @Prop({ required: true, unique: true, index: true })
  discordId: string;

  @Prop({ required: true })
  username: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload: Record<string, unknown>;

  @Prop({ required: true, default: 0, min: 0 })
  points: number;
}

export const PredictionSchema = SchemaFactory.createForClass(Prediction);
PredictionSchema.index({ discordId: 1 }, { unique: true });
