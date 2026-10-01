import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export type StoredObject = {
  key: string;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured for file storage.`);
  return value;
}

function keyFromPath(rawPath: string) {
  if (!rawPath.startsWith("/objects/")) throw new ObjectNotFoundError();
  return rawPath.slice("/objects/".length);
}

function privatePrefix() {
  return (process.env.PRIVATE_OBJECT_DIR || "kraken-study").replace(/^\/+|\/+$/g, "");
}

function publicPrefix() {
  const first = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",")[0]?.trim();
  return (first || "kraken-study/public").replace(/^\/+|\/+$/g, "");
}

function client() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = required("STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = required("STORAGE_SECRET_ACCESS_KEY");
  return new S3Client({
    region: process.env.STORAGE_REGION || "auto",
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket() {
  return process.env.STORAGE_BUCKET || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || required("STORAGE_BUCKET");
}

export class ObjectStorageService {
  async requestUpload(contentType: string) {
    const key = `${privatePrefix()}/uploads/${randomUUID()}`;
    const uploadURL = await getSignedUrl(
      client(),
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
      { expiresIn: 900 },
    );
    return { uploadURL, objectPath: `/objects/${key}` };
  }

  async getObjectEntityUploadURL() {
    return (await this.requestUpload("application/octet-stream")).uploadURL;
  }

  async searchPublicObject(filePath: string): Promise<StoredObject | null> {
    const key = `${publicPrefix()}/${filePath.replace(/^\/+/, "")}`;
    try {
      await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return { key };
    } catch {
      return null;
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    const key = keyFromPath(objectPath);
    try {
      await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return { key };
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  async downloadObject(object: StoredObject, cacheTtlSec = 3600): Promise<Response> {
    try {
      const result = await client().send(
        new GetObjectCommand({ Bucket: bucket(), Key: object.key }),
      );
      const body = result.Body;
      if (!body) throw new ObjectNotFoundError();
      const webStream = Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>;
      const headers: Record<string, string> = {
        "Content-Type": result.ContentType || "application/octet-stream",
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      };
      if (result.ContentLength !== undefined) headers["Content-Length"] = String(result.ContentLength);
      return new Response(webStream, { headers });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw error;
      throw new ObjectNotFoundError();
    }
  }
}