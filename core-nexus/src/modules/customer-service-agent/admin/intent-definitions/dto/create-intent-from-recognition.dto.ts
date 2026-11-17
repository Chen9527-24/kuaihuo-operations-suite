import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateIntentFromRecognitionDto {
  @ApiProperty()
  @IsObject()
  recognizedItem!: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  @Length(1, 4000)
  message!: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  conversationHistory?: Array<Record<string, unknown>>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantRoleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryCode?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  industryCodes?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  understanding?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ['DRAFT', 'DISABLED'], default: 'DRAFT' })
  @IsOptional()
  @IsIn(['DRAFT', 'DISABLED'])
  status?: 'DRAFT' | 'DISABLED';
}
