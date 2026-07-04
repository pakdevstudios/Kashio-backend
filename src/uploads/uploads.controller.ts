import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'crypto';
import { extname } from 'path';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const maxImageSize = 5 * 1024 * 1024;

type PresignImageDto = {
  filename?: string;
  contentType?: string;
  size?: number;
};

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function encodePathPart(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function signingKey(secret: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  @Post('images/presign')
  @Roles(Role.ADMIN)
  presignImage(@Body() dto: PresignImageDto) {
    this.logger.log(
      `S3 presign request received filename=${dto.filename ?? 'unknown'} contentType=${dto.contentType ?? 'unknown'} size=${dto.size ?? 0}`,
    );
    const contentType = dto.contentType?.trim() ?? '';
    if (!allowedImageTypes.has(contentType)) {
      this.logger.warn(`S3 presign rejected unsupported contentType=${contentType}`);
      throw new BadRequestException('Only jpg, png, webp, gif, and avif images can be uploaded');
    }
    if (!dto.size || dto.size <= 0 || dto.size > maxImageSize) {
      this.logger.warn(`S3 presign rejected invalid size=${dto.size ?? 0}`);
      throw new BadRequestException('Image size must be 5MB or less');
    }

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_S3_REGION;
    const bucket = process.env.AWS_S3_BUCKET;
    const rawExpires = process.env.AWS_S3_PRESIGNED_URL_EXPIRY;
    if (!accessKeyId || !secretAccessKey || !region || !bucket || !rawExpires) {
      this.logger.error(
        `S3 upload configuration missing accessKey=${!!accessKeyId} secret=${!!secretAccessKey} region=${!!region} bucket=${!!bucket} expiry=${!!rawExpires}`,
      );
      throw new BadRequestException('S3 upload configuration is missing');
    }

    const extension = extname(dto.filename || '').toLowerCase() || '.jpg';
    const key = `products/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
    const encodedKey = key.split('/').map(encodePathPart).join('/');
    const usePathStyle = bucket.includes('.');
    const host = usePathStyle ? `s3.${region}.amazonaws.com` : `${bucket}.s3.${region}.amazonaws.com`;
    const canonicalUri = usePathStyle
      ? `/${encodePathPart(bucket)}/${encodedKey}`
      : `/${encodedKey}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credential = `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;
    const expires = Number(rawExpires);
    if (!Number.isInteger(expires) || expires <= 0) {
      this.logger.error(`S3 presign invalid expiry=${process.env.AWS_S3_PRESIGNED_URL_EXPIRY}`);
      throw new BadRequestException('S3 presigned URL expiry must be a positive number');
    }
    const signedHeaders = 'host';
    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': signedHeaders,
    });
    const canonicalQuery = Array.from(query.entries())
      .map(([key, value]) => `${encodePathPart(key)}=${encodePathPart(value)}`)
      .sort()
      .join('&');
    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      `${dateStamp}/${region}/s3/aws4_request`,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signature = hmacHex(signingKey(secretAccessKey, dateStamp, region), stringToSign);
    const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
    const finalUrl = `https://${host}${canonicalUri}`;
    this.logger.log(
      `S3 presign response generated key=${key} host=${host} pathStyle=${usePathStyle} expires=${expires}`,
    );
    return {
      key,
      uploadUrl,
      url: finalUrl,
      expiresIn: expires,
      region,
      bucket,
      pathStyle: usePathStyle,
    };
  }
}
