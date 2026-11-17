import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCustomerServiceIntentDefinitionDto } from './create-intent-definition.dto';

export class UpdateCustomerServiceIntentDefinitionDto extends PartialType(
  OmitType(CreateCustomerServiceIntentDefinitionDto, ['tenantId', 'key'] as const),
) {
  @ApiProperty()
  @IsInt()
  @Min(1)
  revision!: number;
}
