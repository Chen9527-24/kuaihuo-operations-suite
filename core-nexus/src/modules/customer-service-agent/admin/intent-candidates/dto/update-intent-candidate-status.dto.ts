import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateIntentCandidateStatusDto {
  @ApiProperty({ enum: ['PENDING', 'IGNORED'] })
  @IsIn(['PENDING', 'IGNORED'])
  status!: 'PENDING' | 'IGNORED';
}
