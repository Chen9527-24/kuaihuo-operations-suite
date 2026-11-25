import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({
    example: 'USER_AVATAR',
    description: '上传场景，如 USER_AVATAR / TENANT_ATTACHMENT / WEBSITE_ASSET',
  })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  scene?: string;
}
