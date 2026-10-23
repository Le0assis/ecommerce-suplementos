import { randomUUID } from "node:crypto";
import { generateClientTokenFromReadWriteToken, handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { HttpError } from "./http";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "./schemas";

export interface SignedUpload {
  token: string;
  pathname: string;
  uploadUrl: string;
  alt: string;
  maximumSizeInBytes: number;
  allowedContentTypes: readonly string[];
}

export interface UploadSignerInput {
  pathname: string;
  alt: string;
  contentType: string;
  maximumSizeInBytes: number;
  allowedContentTypes: readonly string[];
  userId: string;
}

export type UploadSigner = (input: UploadSignerInput) => Promise<SignedUpload>;

export interface BlobHandlerInput {
  body: HandleUploadBody;
  request: Request;
  onBeforeGenerateToken: (pathname: string, clientPayload: string | null) => Promise<Record<string, unknown>>;
  onUploadCompleted: (event: { blob: { url: string; pathname: string }; tokenPayload?: string | null }) => Promise<void>;
}

export type BlobUploadHandler = (input: BlobHandlerInput) => Promise<unknown>;

export function pathnameFor(contentType: string): string {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `pulso/${randomUUID()}.${ext}`;
}

const UPLOAD_PATH = /^pulso\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(jpg|jpeg|png|webp)$/;

export function assertUploadPath(pathname: string): void {
  if (!pathname || pathname.includes("..") || pathname.includes("\\") || pathname.includes("\0") || !UPLOAD_PATH.test(pathname)) {
    throw new HttpError(400, "Caminho de upload inválido.");
  }
}

export function altFromClientPayload(clientPayload: string | null): string {
  if (!clientPayload) throw new HttpError(400, "A foto precisa de texto alternativo.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(clientPayload);
  } catch {
    throw new HttpError(400, "A foto precisa de texto alternativo.");
  }
  const alt = typeof parsed === "object" && parsed && "alt" in parsed ? (parsed as { alt: unknown }).alt : null;
  if (typeof alt !== "string" || !alt.trim()) throw new HttpError(400, "A foto precisa de texto alternativo.");
  return alt.trim();
}

export function uploadConstraints(alt: string, userId: string) {
  return {
    allowedContentTypes: [...UPLOAD_TYPES],
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    addRandomSuffix: false,
    tokenPayload: JSON.stringify({ alt, userId }),
  };
}

export function isBlobEvent(body: unknown): body is HandleUploadBody {
  return typeof body === "object" && body !== null && "type" in body && typeof (body as { type: unknown }).type === "string" && String((body as { type: string }).type).startsWith("blob.");
}

export async function defaultSignUpload(input: UploadSignerInput): Promise<SignedUpload> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new HttpError(503, "Upload sem token. Ligue o Blob da loja pulso-fotos em BLOB_READ_WRITE_TOKEN.");
  const clientToken = await generateClientTokenFromReadWriteToken({
    token,
    pathname: input.pathname,
    allowedContentTypes: [...input.allowedContentTypes],
    maximumSizeInBytes: input.maximumSizeInBytes,
    addRandomSuffix: false,
    validUntil: Date.now() + 60 * 60 * 1000,
  });
  return {
    token: clientToken,
    pathname: input.pathname,
    uploadUrl: `https://vercel.com/api/blob/?pathname=${encodeURIComponent(input.pathname)}`,
    alt: input.alt,
    maximumSizeInBytes: input.maximumSizeInBytes,
    allowedContentTypes: input.allowedContentTypes,
  };
}

export const defaultHandleUpload: BlobUploadHandler = async (input) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new HttpError(503, "Upload sem token. Ligue o Blob da loja pulso-fotos em BLOB_READ_WRITE_TOKEN.");
  return handleUpload({
    body: input.body,
    request: input.request,
    token,
    onBeforeGenerateToken: async (pathname, clientPayload) => input.onBeforeGenerateToken(pathname, clientPayload),
    onUploadCompleted: async (event) => input.onUploadCompleted(event),
  });
};
