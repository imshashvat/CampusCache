/**
 * Vercel Serverless Function: POST /api/validate-upload
 *
 * Validates uploaded files server-side (extension, size, magic bytes).
 * Deletes invalid files from Supabase Storage before DB insert.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "txt", "png", "jpg", "jpeg", "zip",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const MAGIC_SIGNATURES: Array<{ extensions: Set<string>; bytes: number[] }> = [
  { extensions: new Set(["pdf"]),         bytes: [0x25, 0x50, 0x44, 0x46] },          // %PDF
  { extensions: new Set(["png"]),         bytes: [0x89, 0x50, 0x4e, 0x47] },          // \x89PNG
  { extensions: new Set(["jpg", "jpeg"]), bytes: [0xff, 0xd8, 0xff] },                // JFIF/EXIF
  { extensions: new Set(["docx", "pptx", "xlsx", "zip"]), bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK\x03\x04
  { extensions: new Set(["doc", "ppt", "xls"]), bytes: [0xd0, 0xcf, 0x11, 0xe0] },   // Compound Doc
];

const TEXT_EXTENSIONS = new Set(["txt"]);

function getExtension(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

function matchesMagicBytes(buf: Uint8Array, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  return sig.every((b, i) => buf[i] === b);
}

export async function validateUpload(
  reqBody: { filePath?: string; fileName?: string; fileSize?: number },
  authHeader?: string
): Promise<{ status: number; error?: string; ok?: boolean }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { status: 401, error: "Unauthorized" };
  }
  const token = authHeader.slice("Bearer ".length);

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return { status: 500, error: "Server misconfiguration" };
  }

  const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return { status: 401, error: "Unauthorized: invalid token" };
  }
  const userId = claims.claims.sub;

  const { filePath, fileName, fileSize } = reqBody;
  if (!filePath || !fileName || fileSize == null) {
    return { status: 400, error: "Missing filePath, fileName, or fileSize" };
  }

  if (!filePath.startsWith(`${userId}/`)) {
    return { status: 403, error: "Forbidden: file does not belong to you" };
  }

  const ext = getExtension(fileName);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    await adminClient.storage.from("resources").remove([filePath]);
    return {
      status: 422,
      error: `File type ".${ext}" is not allowed. Allowed types: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
    };
  }

  if (fileSize > MAX_BYTES) {
    const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    await adminClient.storage.from("resources").remove([filePath]);
    return { status: 422, error: "File size exceeds the 25 MB limit." };
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    return { status: 200, ok: true };
  }

  const matchedSig = MAGIC_SIGNATURES.find((s) => s.extensions.has(ext));
  if (matchedSig) {
    const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: fileBlob, error: downloadErr } = await adminClient.storage.from("resources").download(filePath);
    if (downloadErr || !fileBlob) {
      await adminClient.storage.from("resources").remove([filePath]);
      return { status: 422, error: "Failed to read uploaded file for validation." };
    }
    const buffer = new Uint8Array(await fileBlob.slice(0, 16).arrayBuffer());
    if (!matchesMagicBytes(buffer, matchedSig.bytes)) {
      await adminClient.storage.from("resources").remove([filePath]);
      return { status: 422, error: `File contents do not match the expected .${ext} format.` };
    }
  }

  return { status: 200, ok: true };
}

export default async function handler(req: any, res?: any) {
  if (typeof Request !== "undefined" && req instanceof Request) {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    const body = await req.json().catch(() => ({}));
    const result = await validateUpload(body, authHeader);
    return new Response(JSON.stringify(result), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["authorization"] ?? req.headers["Authorization"];
  const body = req.body ?? {};
  const result = await validateUpload(body, authHeader);
  return res.status(result.status).json(result);
}
