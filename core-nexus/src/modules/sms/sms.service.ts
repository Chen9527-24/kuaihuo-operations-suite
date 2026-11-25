import { BadGatewayException, BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { SendSmsNotificationDto, SmsNotificationTemplateKey } from './dto/sms-notification.dto';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { TencentSmsProvider } from './providers/tencent-sms.provider';
import { SmsProviderName, SmsSendRequest, SmsSendResult } from './sms-provider.interface';

const NOTIFICATION_TEMPLATE_CONFIG: Record<SmsNotificationTemplateKey, string> = {
  account_disabled: 'TENCENT_SMS_TEMPLATE_ACCOUNT_DISABLED_ID',
};

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly mockSmsProvider: MockSmsProvider,
    private readonly tencentSmsProvider: TencentSmsProvider,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) return;
    const provider = this.getProvider();
    if (provider === 'tencent') {
      this.tencentSmsProvider.assertConfigured();
      return;
    }
    if (provider !== 'mock') {
      throw new Error(`SMS_PROVIDER=${provider} 暂未实现；当前仅支持 mock 或 tencent`);
    }
  }

  async sendNotification(dto: SendSmsNotificationDto) {
    const phone = this.normalizePhone(dto.phone);
    if (!this.isValidPhone(phone)) throw new BadRequestException('手机号格式不正确');
    const provider = this.getProvider();
    const templateKey = dto.templateKey;
    const resendAfter = this.getNotificationResendIntervalSeconds();

    if (!this.isEnabled()) {
      this.logger.warn(`SMS is disabled, skip notification. templateKey=${templateKey}, phone=${this.maskPhone(phone)}`);
      return {
        provider,
        phone: this.maskPhone(phone),
        templateKey,
        resendAfterSeconds: resendAfter,
        skipped: true,
      };
    }

    // 先读取模板配置；未配置时直接拒绝，不占用手机号通知额度。
    const templateId = provider === 'tencent' ? this.getTencentNotificationTemplateId(templateKey) : `mock-notification:${templateKey}`;

    await this.assertNotificationResendAllowed(templateKey, phone);
    await this.assertDailyLimit(
      `sms:limit:notification:phone:${phone}`,
      this.getNotificationPhoneDailyLimit(),
      '该手机号今日接收通知短信次数已达上限',
    );

    const sendResult = await this.sendTemplate({
      provider,
      phone,
      templateId,
      templateParams: this.normalizeTemplateParams(dto.templateParams),
      sessionContext: this.createSessionContext(`notification:${templateKey}`, phone),
    });
    await this.redisService.set(this.notificationResendKey(templateKey, phone), '1', resendAfter);

    this.logAccepted('notification', phone, provider, sendResult, `templateKey=${templateKey}`);
    return {
      provider,
      phone: this.maskPhone(phone),
      templateKey,
      resendAfterSeconds: resendAfter,
      requestId: sendResult.requestId,
    };
  }

  private async sendTemplate(input: {
    provider: SmsProviderName;
    phone: string;
    templateId: string;
    templateParams?: string[];
    sessionContext: string;
  }) {
    const request: SmsSendRequest = {
      phoneNumbers: [input.phone],
      templateId: input.templateId,
      templateParams: input.templateParams,
      sessionContext: input.sessionContext,
    };

    try {
      if (input.provider === 'mock') return await this.mockSmsProvider.send(request);
      if (input.provider === 'tencent') return await this.tencentSmsProvider.send(request);
      throw new Error(`SMS_PROVIDER=${input.provider} 暂未实现；当前仅支持 mock 或 tencent`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMS send failed. provider=${input.provider}, phone=${this.maskPhone(input.phone)}, reason=${message}`);
      if (input.provider === 'tencent') {
        throw new BadGatewayException('短信服务暂时不可用，请稍后重试');
      }
      throw error;
    }
  }

  private async assertNotificationResendAllowed(templateKey: SmsNotificationTemplateKey, phone: string) {
    const ttl = await this.redisService.raw.ttl(this.notificationResendKey(templateKey, phone));
    if (ttl > 0) throw new BadRequestException(`该通知短信已发送，请 ${ttl} 秒后再发送`);
  }

  private async assertDailyLimit(key: string, limit: number, message: string) {
    if (!Number.isFinite(limit) || limit <= 0) return;
    const count = await this.redisService.raw.incr(key);
    if (count === 1) await this.redisService.raw.expire(key, this.secondsUntilNextDay());
    if (count > limit) throw new BadRequestException(message);
  }

  private notificationResendKey(templateKey: SmsNotificationTemplateKey, phone: string) {
    return `sms:resend:notification:${templateKey}:${phone}`;
  }

  private normalizePhone(value?: string | null) {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2);
    return digits;
  }

  private normalizeTemplateParams(params?: string[]) {
    return (params ?? []).map((item) => String(item ?? '').trim());
  }

  private isValidPhone(phone: string) {
    return /^1[3-9]\d{9}$/.test(phone);
  }

  private maskPhone(phone: string) {
    return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }

  private isEnabled() {
    return this.parseBoolean(this.configService.get<string>('SMS_ENABLED'), true);
  }

  private getProvider(): SmsProviderName {
    const provider = String(this.configService.get<string>('SMS_PROVIDER') || 'mock').trim().toLowerCase();
    if (provider === 'mock' || provider === 'tencent') return provider;
    return provider as SmsProviderName;
  }

  private getNotificationResendIntervalSeconds() {
    return this.getNumber('SMS_NOTIFICATION_RESEND_INTERVAL_SECONDS', 60, 10, 3600);
  }

  private getNotificationPhoneDailyLimit() {
    return this.getNumber('SMS_NOTIFICATION_PHONE_DAILY_LIMIT', 20, 1, 200);
  }

  private getTencentNotificationTemplateId(templateKey: SmsNotificationTemplateKey) {
    const configName = NOTIFICATION_TEMPLATE_CONFIG[templateKey];
    const templateId = String(this.configService.get<string>(configName) ?? '').trim();
    if (!templateId) {
      throw new BadRequestException(`通知短信模板未配置：${configName}`);
    }
    return templateId;
  }

  private getNumber(name: string, fallback: number, min: number, max: number) {
    const value = Number(this.configService.get<string | number>(name) ?? fallback);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
  }

  private parseBoolean(value: unknown, fallback: boolean) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(raw);
  }

  private createSessionContext(kind: string, phone: string) {
    return `sms:${kind}:${this.maskPhone(phone)}:${randomUUID()}`.slice(0, 500);
  }

  private logAccepted(kind: 'notification', phone: string, provider: SmsProviderName, result: SmsSendResult, details: string) {
    const serialNos = result.statuses.map((status) => status.serialNo).filter(Boolean).join(',');
    this.logger.log(
      `SMS accepted. kind=${kind}, provider=${provider}, phone=${this.maskPhone(phone)}, ${details}, requestId=${result.requestId ?? '-'}, serialNos=${serialNos || '-'}`,
    );
  }

  private secondsUntilNextDay() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    return Math.max(60, Math.ceil((next.getTime() - now.getTime()) / 1000));
  }
}
