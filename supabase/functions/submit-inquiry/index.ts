// 홈페이지 문의 폼 접수 함수.
// Cloudflare Turnstile(봇 인증) 토큰을 확인한 뒤에만 inquiries 테이블에 저장하고 접수 메일을 보낸다.
// 필요한 Secrets: TURNSTILE_SECRET_KEY, RESEND_API_KEY
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동으로 넣어준다)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, isSpam, jsonResponse, sendInquiryEmail } from "../_shared/inquiry.ts";

const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const TYPES = ["quote", "processing", "used"];
const TEXT_FIELDS = [
  "company", "contact_name", "phone", "email", "product_size",
  "process_method", "daily_qty", "processing_qty", "message", "product_context",
];

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const form = new FormData();
  form.append("secret", TURNSTILE_SECRET_KEY!);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!data.success) console.warn("Turnstile failed:", data["error-codes"]);
  return data.success === true;
}

// 클라이언트가 보낸 값 중 테이블에 넣을 항목만 골라낸다.
function buildRow(body: Record<string, unknown>) {
  const row: Record<string, unknown> = { type: TYPES.includes(String(body.type)) ? body.type : "quote" };
  for (const k of TEXT_FIELDS) {
    const v = body[k];
    row[k] = v === undefined || v === null || String(v).trim() === "" ? null : String(v).slice(0, 5000);
  }
  row.company ??= "";
  row.contact_name ??= "";
  row.phone ??= "";
  const files = Array.isArray(body.file_url) ? body.file_url : [];
  const paths = files
    .map(String)
    .filter((p) => /^(quote|processing|used)\/[\w.-]+$/.test(p))
    .slice(0, 20);
  row.file_url = paths.length ? paths : null;
  return row;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!TURNSTILE_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("TURNSTILE_SECRET_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
      return jsonResponse({ error: "server not configured" }, 500);
    }

    const body = await req.json();
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    if (!body.turnstile_token || !(await verifyTurnstile(String(body.turnstile_token), ip))) {
      return jsonResponse({ error: "captcha_failed" }, 403);
    }

    const row = buildRow(body);
    if (isSpam({ ...row, website: body.website })) {
      // 봇이 눈치채지 못하도록 성공 응답만 돌려준다.
      console.warn("Spam inquiry ignored:", row.company, row.email);
      return jsonResponse({ ok: true });
    }

    const insert = await fetch(`${SUPABASE_URL}/rest/v1/inquiries`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!insert.ok) {
      const errText = await insert.text();
      console.error("Insert error:", errText);
      return jsonResponse({ error: "insert_failed" }, 500);
    }

    // 저장은 끝났으므로 메일 발송 실패는 로그만 남기고 접수는 성공으로 처리한다.
    try {
      await sendInquiryEmail(String(row.type), row);
    } catch (err) {
      console.error("Resend error:", String(err));
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
