import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export const SMS_CODE_SCENES = ['login', 'profile', 'leader_bind', 'task_account'] as const;
export type SmsCodeScene = (typeof SMS_CODE_SCENES)[number];

export class SendSmsCodeDto {
  @ApiProperty({ example: '13812345678', description: '接收验证码的手机号。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ enum: SMS_CODE_SCENES, example: 'login', description: '验证码业务场景。' })
  @IsIn(SMS_CODE_SCENES)
  scene!: SmsCodeScene;
}

export class VerifySmsCodeDto extends SendSmsCodeDto {
  @ApiProperty({ example: '123456', description: '短信验证码。' })
  @IsString()
  @Length(4, 12)
  code!: string;
}

export class SmsCodeFieldDto {
  @ApiPropertyOptional({ example: '123456', description: '短信验证码。mock 阶段默认测试码 123456；真实短信阶段由用户填写短信收到的验证码。' })
  @IsOptional()
  @IsString()
  @Length(4, 12)
  smsCode?: string;
}
