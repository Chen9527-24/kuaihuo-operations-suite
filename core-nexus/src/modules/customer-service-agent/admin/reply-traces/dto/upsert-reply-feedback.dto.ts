import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertCustomerServiceReplyFeedbackDto {
  @ApiProperty({ enum: ['SATISFIED', 'UNSATISFIED'] })
  @IsIn(['SATISFIED', 'UNSATISFIED'])
  feedback!: 'SATISFIED' | 'UNSATISFIED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
