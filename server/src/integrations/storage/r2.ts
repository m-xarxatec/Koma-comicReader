import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertImageKey, type StorageDriver } from './driver.js';

// Driver R2 (online): bucket privado y URLs prefirmadas de GetObject que caducan a los SIGNED_URL_TTL_SECONDS.
// Configuración de R2 con el AWS SDK v3 (CLAUDE.md, "Trampas conocidas"): región 'auto', endpoint de la
// cuenta y sumas de comprobación solo cuando las exige la operación.

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  ttlSeconds: number;
}

const endpoint = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

// Orígenes de las URLs prefirmadas, para img-src de la CSP: bucket en la ruta o como subdominio.
export function r2ImageHosts(accountId: string, bucket: string): string[] {
  return [endpoint(accountId), `https://${bucket}.${accountId}.r2.cloudflarestorage.com`];
}

export function createR2Storage(config: R2Config): StorageDriver {
  const client = new S3Client({
    region: 'auto',
    endpoint: endpoint(config.accountId),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    name: 'r2',
    async put(key, sourcePath, contentType) {
      assertImageKey(key);
      const { size } = await stat(sourcePath); // un stream necesita ContentLength explícito
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: createReadStream(sourcePath),
          ContentLength: size,
          ContentType: contentType,
        }),
      );
    },
    async signedUrl(key) {
      assertImageKey(key);
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: config.ttlSeconds });
    },
    // DeleteObject de S3 (y R2) ya es idempotente: una clave inexistente responde 204. El token de R2 necesita
    // permiso de escritura ("Object Read & Write"), que incluye borrar.
    async remove(key) {
      assertImageKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
