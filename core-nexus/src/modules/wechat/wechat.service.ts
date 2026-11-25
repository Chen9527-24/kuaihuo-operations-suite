import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { RedisService } from '../../redis/redis.service';
import { WechatUrlDto, WxMiniProfileDto, WxacodeDto } from './dto/wechat.dto';

type WxEnvVersion = 'develop' | 'trial' | 'release';

type WechatJson = Record<string, any>;

@Injectable()
export class WechatService {
  private accessTokenLoading?: Promise<string>;
  private officialAccountTokenLoading?: Promise<string>;
  private officialAccountJsapiTicketLoading?: Promise<string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  getMiniProgramMode(version?: string) {
    const currentVersion = String(version ?? '').trim();
    const forcedMode = String(process.env.MINI_PROGRAM_FORCE_MODE ?? '').trim().toLowerCase();
    const auditVersion = String(process.env.MINI_PROGRAM_AUDIT_VERSION ?? '').trim();
    const auditVersions = String(process.env.MINI_PROGRAM_AUDIT_VERSIONS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const auditEnabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.MINI_PROGRAM_AUDIT_ENABLED ?? '').trim().toLowerCase(),
    );

    const isAudit = forcedMode === 'audit'
      || auditEnabled
      || (!!currentVersion && currentVersion === auditVersion)
      || (!!currentVersion && auditVersions.includes(currentVersion));

    return {
      mode: isAudit ? 'audit' : 'release',
      isAudit,
      isInAudit: isAudit,
      isLiteMode: isAudit,
      auditVersion,
      auditVersions,
      modeVersion: currentVersion || auditVersion || '',
      currentVersion,
    };
  }

  async exchangeLogin(code: string) {
    const appid = this.requireMiniAppId();
    const secret = this.requireMiniSecret();
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    const payload = await this.fetchWechatJson(url.toString());
    this.assertWechatOk(payload, '微信登录凭证换取失败');

    const token = this.createToken(payload.openid, payload.session_key);
    await this.redisService.set(
      `wechat:mini:session:${token}`,
      JSON.stringify({ ...payload, token, createdAt: new Date().toISOString() }),
      7 * 24 * 60 * 60,
    );

    return {
      token,
      sessionToken: token,
      openid: payload.openid,
      openId: payload.openid,
      unionid: payload.unionid,
      expiresIn: 7 * 24 * 60 * 60,
    };
  }

  async exchangePhone(code: string, authorization?: string) {
    const accessToken = await this.getAccessToken();
    const payload = await this.fetchWechatJson(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      },
    );
    this.assertWechatOk(payload, '微信手机号换取失败');
    const info = payload.phone_info ?? {};
    const token = this.readBearerToken(authorization);
    if (token) {
      const rawSession = await this.redisService.get(`wechat:mini:session:${token}`);
      if (rawSession) {
        await this.redisService.set(
          `wechat:mini:session:${token}`,
          JSON.stringify({ ...JSON.parse(rawSession), phoneInfo: info, updatedAt: new Date().toISOString() }),
          7 * 24 * 60 * 60,
        );
      }
    }
    return {
      phoneNumber: info.phoneNumber,
      purePhoneNumber: info.purePhoneNumber,
      countryCode: info.countryCode,
      watermark: info.watermark,
    };
  }

  async getProfile(authorization?: string) {
    const token = this.readBearerToken(authorization);
    if (!token) return {};
    const raw = await this.redisService.get(`wechat:mini:profile:${token}`);
    return raw ? JSON.parse(raw) : {};
  }

  async saveProfile(dto: WxMiniProfileDto, authorization?: string) {
    const token = this.readBearerToken(authorization);
    if (!token) {
      throw new BadRequestException('缺少登录 token，请先调用 /api/v1/wx-mini/login');
    }
    const profile = {
      nickname: String(dto.nickname ?? '').trim(),
      avatarUrl: String(dto.avatarUrl ?? '').trim(),
      updatedAt: new Date().toISOString(),
    };
    await this.redisService.set(`wechat:mini:profile:${token}`, JSON.stringify(profile), 7 * 24 * 60 * 60);
    return profile;
  }

  async createWxacode(dto: WxacodeDto) {
    const accessToken = await this.getAccessToken();
    const page = String(dto.page || process.env.WECHAT_MINI_CODE_PAGE || 'pages/Home').replace(/^\//, '');
    const envVersion = this.resolveEnvVersion(dto.envVersion);
    const sceneInfo = await this.buildScene(dto);
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: sceneInfo.scene,
          page,
          check_path: dto.checkPath ?? false,
          env_version: envVersion,
        }),
      },
    );

    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (contentType.includes('application/json')) {
      const text = buffer.toString('utf8');
      const payload = this.safeJson(text);
      this.assertWechatOk(payload, '微信小程序码生成失败');
      throw new InternalServerErrorException('微信小程序码生成失败：未返回图片内容');
    }
    if (!response.ok || buffer.length === 0) {
      throw new InternalServerErrorException(`微信小程序码生成失败：HTTP ${response.status}`);
    }

    const file = await this.saveWxacodeImage(buffer, sceneInfo.ticket);
    return {
      ...sceneInfo,
      page,
      envVersion,
      url: file.url,
      fullUrl: file.fullUrl,
    };
  }

  async createUrlLink(dto: WechatUrlDto) {
    const accessToken = await this.getAccessToken();
    const payload = await this.fetchWechatJson(
      `https://api.weixin.qq.com/wxa/generate_urllink?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: dto.path || process.env.WECHAT_MINI_CODE_PAGE || 'pages/Home',
          query: dto.query || '',
          env_version: this.resolveEnvVersion(dto.envVersion),
          expire_type: dto.expireType ?? 1,
          expire_interval: dto.expireInterval ?? 30,
          cloud_base: dto.cloudBase,
        }),
      },
    );
    this.assertWechatOk(payload, '微信 URL Link 生成失败');
    return payload;
  }

  async createUrlScheme(dto: WechatUrlDto) {
    const accessToken = await this.getAccessToken();
    const payload = await this.fetchWechatJson(
      `https://api.weixin.qq.com/wxa/generatescheme?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jump_wxa: {
            path: dto.path || process.env.WECHAT_MINI_CODE_PAGE || 'pages/Home',
            query: dto.query || '',
            env_version: this.resolveEnvVersion(dto.envVersion),
          },
          expire_type: dto.expireType ?? 1,
          expire_interval: dto.expireInterval ?? 30,
        }),
      },
    );
    this.assertWechatOk(payload, '微信 URL Scheme 生成失败');
    return payload;
  }


  async createOfficialAccountJsSdkSignature(pageUrl?: string | null) {
    const cleanUrl = String(pageUrl || '').trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
      throw new BadRequestException('缺少有效的页面 URL');
    }
    const appId = this.requireOfficialAccountAppId();
    const jsapiTicket = await this.getOfficialAccountJsapiTicket();
    const nonceStr = randomBytes(8).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const source = [
      `jsapi_ticket=${jsapiTicket}`,
      `noncestr=${nonceStr}`,
      `timestamp=${timestamp}`,
      `url=${cleanUrl}`,
    ].join('&');
    const signature = createHash('sha1').update(source).digest('hex');
    return { appId, nonceStr, timestamp, signature };
  }

  async resolveScene(ticket: string) {
    const raw = await this.redisService.get(`wechat:mini:scene:${ticket}`);
    if (!raw) {
      throw new NotFoundException('小程序码参数不存在或已过期');
    }
    return JSON.parse(raw);
  }

  private async getAccessToken() {
    const cached = await this.redisService.get('wechat:mini:access_token');
    if (cached) return cached;
    if (this.accessTokenLoading) return this.accessTokenLoading;

    this.accessTokenLoading = (async () => {
      const appid = this.requireMiniAppId();
      const secret = this.requireMiniSecret();
      const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
      url.searchParams.set('grant_type', 'client_credential');
      url.searchParams.set('appid', appid);
      url.searchParams.set('secret', secret);
      const payload = await this.fetchWechatJson(url.toString());
      this.assertWechatOk(payload, '微信 access_token 获取失败');
      const token = String(payload.access_token || '').trim();
      if (!token) throw new InternalServerErrorException('微信 access_token 获取失败：返回为空');
      const ttl = Math.max(60, Number(payload.expires_in || 7200) - 300);
      await this.redisService.set('wechat:mini:access_token', token, ttl);
      return token;
    })();

    try {
      return await this.accessTokenLoading;
    } finally {
      this.accessTokenLoading = undefined;
    }
  }


  private async getOfficialAccountAccessToken() {
    const cached = await this.redisService.get('wechat:mp:access_token');
    if (cached) return cached;
    if (this.officialAccountTokenLoading) return this.officialAccountTokenLoading;

    this.officialAccountTokenLoading = (async () => {
      const appid = this.requireOfficialAccountAppId();
      const secret = this.requireOfficialAccountSecret();
      const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
      url.searchParams.set('grant_type', 'client_credential');
      url.searchParams.set('appid', appid);
      url.searchParams.set('secret', secret);
      const payload = await this.fetchWechatJson(url.toString());
      this.assertWechatOk(payload, '微信公众号 access_token 获取失败');
      const token = String(payload.access_token || '').trim();
      if (!token) throw new InternalServerErrorException('微信公众号 access_token 获取失败：返回为空');
      const ttl = Math.max(60, Number(payload.expires_in || 7200) - 300);
      await this.redisService.set('wechat:mp:access_token', token, ttl);
      return token;
    })();

    try {
      return await this.officialAccountTokenLoading;
    } finally {
      this.officialAccountTokenLoading = undefined;
    }
  }

  private async getOfficialAccountJsapiTicket() {
    const cached = await this.redisService.get('wechat:mp:jsapi_ticket');
    if (cached) return cached;
    if (this.officialAccountJsapiTicketLoading) return this.officialAccountJsapiTicketLoading;

    this.officialAccountJsapiTicketLoading = (async () => {
      const accessToken = await this.getOfficialAccountAccessToken();
      const url = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket');
      url.searchParams.set('access_token', accessToken);
      url.searchParams.set('type', 'jsapi');
      const payload = await this.fetchWechatJson(url.toString());
      this.assertWechatOk(payload, '微信公众号 jsapi_ticket 获取失败');
      const ticket = String(payload.ticket || '').trim();
      if (!ticket) throw new InternalServerErrorException('微信公众号 jsapi_ticket 获取失败：返回为空');
      const ttl = Math.max(60, Number(payload.expires_in || 7200) - 300);
      await this.redisService.set('wechat:mp:jsapi_ticket', ticket, ttl);
      return ticket;
    })();

    try {
      return await this.officialAccountJsapiTicketLoading;
    } finally {
      this.officialAccountJsapiTicketLoading = undefined;
    }
  }

  private async buildScene(dto: WxacodeDto) {
    const directScene = String(dto.scene || '').trim();
    const payload = {
      tenantsId: String(dto.tenantsId || dto.tenantId || '').trim(),
      tenantId: String(dto.tenantId || dto.tenantsId || '').trim(),
      postId: String(dto.postId || '').trim(),
      type: 'post',
    };
    if (directScene) {
      return { scene: directScene, ticket: this.hashText(directScene).slice(0, 24), payload: { scene: directScene } };
    }
    if (!payload.tenantsId || !payload.postId) {
      throw new BadRequestException('生成带参小程序码时必须提供 tenantId/tenantsId 和 postId，或直接提供 scene。');
    }
    const ticket = randomBytes(12).toString('hex');
    const ttl = Number(process.env.WECHAT_SCENE_TTL_SECONDS || 30 * 24 * 60 * 60);
    await this.redisService.set(`wechat:mini:scene:${ticket}`, JSON.stringify(payload), ttl);
    return { scene: `s=${ticket}`, ticket, payload };
  }

  private async saveWxacodeImage(buffer: Buffer, ticket: string) {
    const uploadDir = this.configService.get<string>('storage.localUploadDir', 'uploads');
    const subDir = 'wechat-codes';
    const filename = `${ticket || randomBytes(6).toString('hex')}.png`;
    const fullDir = join(process.cwd(), uploadDir, subDir);
    await fs.mkdir(fullDir, { recursive: true });
    await fs.writeFile(join(fullDir, filename), buffer);
    const relativeUrl = `/${uploadDir}/${subDir}/${filename}`.replace(/\/+/g, '/');
    const baseUrl = String(this.configService.get<string>('app.baseUrl', '') || '').replace(/\/+$/, '');
    return {
      url: relativeUrl,
      fullUrl: baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl,
      ext: extname(filename),
    };
  }


  private requireOfficialAccountAppId() {
    const value = String(process.env.WECHAT_MP_APPID || process.env.WECHAT_OFFICIAL_APPID || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MP_APPID，请在 .env 中配置微信服务号 AppID。');
    return value;
  }

  private requireOfficialAccountSecret() {
    const value = String(process.env.WECHAT_MP_SECRET || process.env.WECHAT_OFFICIAL_SECRET || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MP_SECRET，请在 .env 中配置微信服务号 AppSecret。');
    return value;
  }

  private requireMiniAppId() {
    const value = String(process.env.WECHAT_MINI_APPID || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MINI_APPID，请在 .env 中配置微信小程序 AppID。');
    return value;
  }

  private requireMiniSecret() {
    const value = String(process.env.WECHAT_MINI_SECRET || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MINI_SECRET，请在 .env 中配置微信小程序 AppSecret。');
    return value;
  }

  private resolveEnvVersion(value?: WxEnvVersion) {
    const configured = String(value || process.env.WECHAT_MINI_ENV_VERSION || 'release').trim();
    if (configured === 'develop' || configured === 'trial' || configured === 'release') return configured;
    return 'release';
  }

  private createToken(openid?: string, sessionKey?: string) {
    const seed = [openid || '', sessionKey || '', randomBytes(16).toString('hex'), Date.now()].join(':');
    return createHash('sha256').update(seed).digest('hex');
  }

  private hashText(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private readBearerToken(authorization?: string) {
    const raw = String(authorization || '').trim();
    if (!raw) return '';
    return raw.replace(/^Bearer\s+/i, '').trim();
  }

  private async fetchWechatJson(url: string, init?: any): Promise<WechatJson> {
    const response = await fetch(url, init);
    const text = await response.text();
    const payload = this.safeJson(text);
    if (!response.ok) {
      throw new InternalServerErrorException(`微信接口请求失败：HTTP ${response.status}`);
    }
    return payload;
  }

  private safeJson(text: string): WechatJson {
    try {
      return JSON.parse(text || '{}') as WechatJson;
    } catch {
      return { raw: text };
    }
  }

  private assertWechatOk(payload: WechatJson, prefix: string) {
    const errcode = Number(payload?.errcode || 0);
    if (errcode !== 0) {
      const errmsg = String(payload?.errmsg || 'unknown error');
      throw new BadRequestException(`${prefix}：${errcode} ${errmsg}`);
    }
  }
}
