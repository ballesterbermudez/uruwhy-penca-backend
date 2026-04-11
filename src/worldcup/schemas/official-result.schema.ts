import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type OfficialResultDocument = HydratedDocument<OfficialResult>;

@Schema({ collection: 'official_results', timestamps: false })
export class OfficialResult {
  @Prop({ required: true, unique: true, index: true, default: 'active' })
  key: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  groupOrder: Record<string, Array<string | null>>;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  knockout: {
    r32: Array<string | null>;
    r16: Array<string | null>;
    qf: Array<string | null>;
    sf: Array<string | null>;
    final: Array<string | null>;
    champion: Array<string | null>;
  };

  @Prop({ required: false })
  updatedAt: Date;

  @Prop({ required: false, default: '' })
  updatedBy: string;
}

export const OfficialResultSchema = SchemaFactory.createForClass(OfficialResult);
OfficialResultSchema.index({ key: 1 }, { unique: true });
