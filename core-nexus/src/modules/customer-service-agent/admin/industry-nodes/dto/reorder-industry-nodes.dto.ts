import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ReorderCustomerServiceIndustryNodeItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  sort!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;
}

export class ReorderCustomerServiceIndustryNodesDto {
  @ApiProperty({ type: [ReorderCustomerServiceIndustryNodeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderCustomerServiceIndustryNodeItemDto)
  nodes!: ReorderCustomerServiceIndustryNodeItemDto[];
}
