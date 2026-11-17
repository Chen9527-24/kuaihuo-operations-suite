import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateCustomerServiceAssetVersionDto {
  @ApiProperty({ example: '首版基础策略' })
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  content!: Record<string, unknown>;
}
