// 홈페이지 견적/임가공/중고장비 문의 폼이 제출되면 회사 메일로 접수 내용을 전달하는 함수.
// 배포 후 Supabase 대시보드(Edge Functions > send-inquiry-email > Secrets)에
// RESEND_API_KEY 를 반드시 등록해야 실제 발송됩니다.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("INQUIRY_FROM_EMAIL") || "onboarding@resend.dev";
const TO_EMAIL = "blast@koreablast.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

type FieldDef = { key: string; label: string };
type TypeMeta = { title: string; fields: FieldDef[] };

const TYPE_META: Record<string, TypeMeta> = {
  quote: {
    title: "제품 견적 문의",
    fields: [
      { key: "product_context", label: "문의 제품" },
      { key: "company", label: "업체명" },
      { key: "contact_name", label: "담당자 성함" },
      { key: "phone", label: "연락처" },
      { key: "email", label: "이메일" },
      { key: "product_size", label: "제품 최대 사이즈" },
      { key: "process_method", label: "처리방법" },
      { key: "daily_qty", label: "하루 생산량" },
      { key: "message", label: "문의사항" },
    ],
  },
  processing: {
    title: "임가공 의뢰 문의",
    fields: [
      { key: "company", label: "업체명" },
      { key: "contact_name", label: "성함" },
      { key: "phone", label: "연락처" },
      { key: "email", label: "이메일" },
      { key: "product_size", label: "제품 사이즈" },
      { key: "processing_qty", label: "임가공 수량" },
    ],
  },
  used: {
    title: "중고장비 구매 문의",
    fields: [
      { key: "product_context", label: "문의 매물" },
      { key: "company", label: "업체명" },
      { key: "contact_name", label: "성함" },
      { key: "phone", label: "연락처" },
      { key: "email", label: "이메일" },
      { key: "message", label: "문의내용" },
    ],
  },
};

function buildEmailHtml(type: string, payload: Record<string, unknown>): string {
  const meta = TYPE_META[type] ?? TYPE_META.quote;
  const rows = meta.fields
    .filter((f) => {
      const v = payload[f.key];
      return v !== undefined && v !== null && String(v).trim() !== "";
    })
    .map(
      (f) => `
      <tr>
        <td style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:13px;color:#475569;white-space:nowrap;vertical-align:top;width:130px;">${esc(f.label)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;white-space:pre-wrap;">${esc(payload[f.key])}</td>
      </tr>`
    )
    .join("");

  const fileRow = payload.file_url
    ? `<tr>
        <td style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:13px;color:#475569;white-space:nowrap;">첨부파일</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;">
          <a href="https://zaajbkjzpzwxdinnrekv.supabase.co/storage/v1/object/public/inquiry-files/${esc(payload.file_url)}" style="color:#b91c1c;font-weight:700;text-decoration:none;">파일 열기</a>
        </td>
      </tr>`
    : "";

  return `
  <div style="background:#f1f5f9;padding:32px 16px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="background:#b91c1c;padding:24px 28px;">
        <p style="margin:0;color:#fecaca;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">한국브라스트(주) 홈페이지 문의 접수</p>
        <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">${esc(meta.title)}</h1>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${rows}
        ${fileRow}
      </table>
      <div style="padding:16px 28px;background:#f8fafc;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">홈페이지 문의 폼을 통해 자동으로 접수된 메일입니다. 어드민 페이지의 '문의 접수 내역'에서도 확인하실 수 있습니다.</p>
      </div>
    </div>
  </div>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const type = String(payload.type ?? "quote");

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = TYPE_META[type] ?? TYPE_META.quote;
    const html = buildEmailHtml(type, payload);
    const subject = `[한국브라스트] 새 ${meta.title} - ${payload.company ?? "이름없음"}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `한국브라스트 홈페이지 <${FROM_EMAIL}>`,
        to: [TO_EMAIL],
        reply_to: payload.email || undefined,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
