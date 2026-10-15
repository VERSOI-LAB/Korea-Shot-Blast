// 홈페이지 견적/임가공/중고장비 문의 폼이 제출되면 회사 메일로 접수 내용을 전달하는 함수.
// 배포 후 Supabase 대시보드(Edge Functions > send-inquiry-email > Secrets)에
// RESEND_API_KEY 를 반드시 등록해야 실제 발송됩니다.
// 새 홈페이지는 submit-inquiry 를 사용하며, 이 함수는 이전 버전 홈페이지 호환용으로 남겨둔다.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, isSpam, jsonResponse, RESEND_API_KEY, sendInquiryEmail } from "../_shared/inquiry.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const type = String(payload.type ?? "quote");

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return jsonResponse({ error: "RESEND_API_KEY not configured" }, 500);
    }

    if (isSpam(payload)) {
      console.warn("Spam inquiry ignored:", payload.company, payload.email);
      return jsonResponse({ ok: true });
    }

    try {
      await sendInquiryEmail(type, payload);
    } catch (err) {
      console.error("Resend error:", String(err));
      return jsonResponse({ error: String(err) }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
