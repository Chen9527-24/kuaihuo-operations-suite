import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';
import { CUSTOMER_SERVICE_ROLE_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class CreateCustomerServiceRolePrototypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ example: 'warm-professional' })
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  code!: string;

  @ApiProperty({ example: '温和专业型' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  languageStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  servicePosture?: string;

  @ApiPropertyOptional({ type: Object, description: 'HVE V1.8 typed RoleSpeakerProfileV1' })
  @IsOptional()
  @IsObject()
  speakerProfile?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ROLE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ROLE_STATUSES)
  status?: string;
}
