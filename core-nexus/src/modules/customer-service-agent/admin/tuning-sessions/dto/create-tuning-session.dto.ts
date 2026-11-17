import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCustomerServiceTuningSessionDto {
  @ApiProperty()
  @IsString()
  merchantRoleId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountProfileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeProfileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryNodeId?: string;

  @ApiPropertyOptional({ default: '新调优对话' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;
}
