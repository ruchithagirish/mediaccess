import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "../../lib/errors";

export const MAX_REPORT_SIZE = 20 * 1024 * 1024;
const supportedReportTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
let cachedClient: S3Client | null = null;

function storageConfig() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) throw new AppError(503, "REPORT_STORAGE_NOT_CONFIGURED", "Investigation report storage is not configured.");
  return { bucket, region };
}

function client(region: string) {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region,
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }
  return cachedClient;
}

export function validateReportType(contentType: string) {
  if (!supportedReportTypes.has(contentType)) throw new AppError(422, "UNSUPPORTED_REPORT_TYPE", "Upload a PDF, PNG, or JPEG report.");
}

export async function createReportUploadUrl(input: { tenantId: string; orderId: string; fileName: string; contentType: string }) {
  validateReportType(input.contentType);
  const { bucket, region } = storageConfig();
  const safeName = input.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "report";
  const objectKey = `tenants/${input.tenantId}/investigations/${input.orderId}/${crypto.randomUUID()}-${safeName}`;
  const command = new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: input.contentType });
  const uploadUrl = await getSignedUrl(client(region), command, { expiresIn: 300 });
  return { uploadUrl, objectKey, requiredHeaders: { "Content-Type": input.contentType }, expiresIn: 300 };
}

export async function verifyReportObject(objectKey: string, contentType: string) {
  validateReportType(contentType);
  const { bucket, region } = storageConfig();
  const head = await client(region).send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!head.ContentLength || head.ContentLength > MAX_REPORT_SIZE) throw new AppError(413, "REPORT_SIZE_INVALID", "Report must be smaller than 20 MB and not empty.");
  if (head.ContentType !== contentType) throw new AppError(422, "REPORT_CONTENT_TYPE_MISMATCH", "Uploaded content type does not match the requested report type.");
  return { sizeBytes: head.ContentLength, contentType: head.ContentType };
}

export async function createReportDownloadUrl(objectKey: string) {
  const { bucket, region } = storageConfig();
  const command = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  return getSignedUrl(client(region), command, { expiresIn: 300 });
}