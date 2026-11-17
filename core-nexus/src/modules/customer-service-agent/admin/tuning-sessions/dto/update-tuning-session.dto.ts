import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdateCustomerServiceTuningSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantRoleId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  accountProfileId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  industryNodeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  contextSnapshot?: Record<string, unknown>;
}
