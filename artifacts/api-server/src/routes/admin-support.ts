import { Router, type NextFunction, type Request, type Response } from "express";
import { getAdminCsrfToken, isAdminSession, validateAdminCsrfToken } from "../lib/admin-auth.js";
import { getFirestoreDb, handleRouteError, nowTs, serializeDoc } from "../services/firebase-admin.js";
import { cleanupExpiredSupportAttachment, storeSupportAttachment } from "../services/supportAttachments.js";
import { notifySupportTicket } from "../services/pushNotifications.js";

export const adminSupportPanelRouter = Router();
export const adminSupportApiRouter = Router();

function readSession(req: { headers: { cookie?: string } }) {
  const cookie = String(req.headers.cookie ?? "");
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function injectCsrf(content: string, csrfToken?: string) {
  if (!csrfToken) return content;
  return content.replace(/<form([^>]*method=["\']post["\'][^>]*)>/gi, `<form$1><input type="hidden" name="_csrf" value="${csrfToken}" />`);
}

function supportAttachmentFields() {
  return `
    <div class="stack" style="gap:6px">
      <label class="small muted">Attachment (optional image or voice note)</label>
      <input class="input support-attachment-input" type="file" accept="image/*,audio/*" />
      <div class="small muted" data-support-attachment-status>Selected file will expire after 24 hours.</div>
      <input type="hidden" name="attachmentBase64" value="" />
      <input type="hidden" name="attachmentName" value="" />
      <input type="hidden" name="attachmentMimeType" value="" />
      <input type="hidden" name="attachmentExpiresInHours" value="24" />
    </div>`;
}

function supportAttachmentScript() {
  return `<script>(function(){
    function humanSize(bytes){
      if(!bytes && bytes !== 0) return '';
      if(bytes < 1024) return bytes + ' B';
      if(bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }
    function wireSupportAttachmentForm(form){
      if(!form || form.dataset.supportAttachmentWired === '1') return;
      form.dataset.supportAttachmentWired = '1';
      var input = form.querySelector('.support-attachment-input');
      var base64 = form.querySelector('input[name="attachmentBase64"]');
      var name = form.querySelector('input[name="attachmentName"]');
      var mime = form.querySelector('input[name="attachmentMimeType"]');
      var status = form.querySelector('[data-support-attachment-status]');
      if(!input || !base64 || !name || !mime) return;
      var clearStatus = function(){ if(status) status.textContent = 'Selected file will expire after 24 hours.'; };
      input.addEventListener('change', function(){
        var file = input.files && input.files[0] ? input.files[0] : null;
        if(!file){
          base64.value = ''; name.value = ''; mime.value = ''; clearStatus(); return;
        }
        var reader = new FileReader();
        reader.onload = function(){
          base64.value = String(reader.result || '');
          name.value = file.name || 'support-attachment';
          mime.value = file.type || 'application/octet-stream';
          if(status) status.textContent = 'Selected: ' + (file.name || 'attachment') + ' (' + humanSize(file.size) + ') — expires in 24 hours.';
        };
        reader.readAsDataURL(file);
      });
    }
    window.__earnDailyWireSupportAttachmentForm = wireSupportAttachmentForm;
    function mountSupportReplyForms(){
      var forms = [].slice.call(document.querySelectorAll('form[action*="/api/admin/support/"][action$="/reply"]'));
      forms.forEach(wireSupportAttachmentForm);
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSupportReplyForms);
    else mountSupportReplyForms();
  })();</script>`;
}

function supportShell(content: string, csrfToken?: string) {
  const safeContent = injectCsrf(content, csrfToken);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Support Replies</title><style>body{margin:0;font-family:Inter,Arial,sans-serif;background:#080814;color:#fff}a,input,button,textarea{font:inherit}.wrap{max-width:1180px;margin:0 auto;padding:24px}.card{background:#131326;border:1px solid #2d2d4a;border-radius:18px;padding:18px}.muted{color:#9ca3af}.btn{background:#7c3aed;color:#fff;border:0;border-radius:12px;padding:10px 13px;cursor:pointer;text-decoration:none;display:inline-block}.btn.gold{background:#f59e0b;color:#160a00}.btn.red{background:#ef4444}.btn.green{background:#10b981}.input{width:100%;padding:10px 12px;border-radius:12px;border:1px solid #384163;background:#0d0d1a;color:#fff;box-sizing:border-box}.support-attachment-input{padding:9px 12px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #2d2d4a;text-align:left;font-size:13px;vertical-align:top}.actions{display:flex;gap:6px;flex-wrap:wrap}.stack{display:grid;gap:8px}.small{font-size:12px}.ok{color:#86efac}.warn{color:#fcd34d}.danger{color:#fca5a5}.reply{background:#0d1b17;border:1px solid #1f5f48;border-radius:12px;padding:10px;white-space:pre-wrap}.attachment-box{display:grid;gap:8px;background:#0f1325;border:1px solid #313a63;border-radius:12px;padding:10px}.attachment-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.attachment-chip{display:inline-flex;align-items:center;gap:6px;background:#1c233d;border:1px solid #384163;border-radius:999px;padding:6px 10px;color:#fff;text-decoration:none}.attachment-chip:hover{opacity:.92}</style></head><body><div class="wrap">${safeContent}</div>${supportAttachmentScript()}</body></html>`;
}

function requireAdminPanel(req: Request, res: Response, next: NextFunction) {
  if (!isAdminSession(readSession(req))) {
    res.redirect("/admin/login");
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminSession(readSession(req))) {
    res.status(401).json({ error: "Unauthorized", code: "admin_unauthorized" });
    return;
  }
  next();
}

function requireAdminCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") {
    next();
    return;
  }
  const submitted = String(req.body?._csrf ?? req.headers["x-csrf-token"] ?? "");
  if (!validateAdminCsrfToken(readSession(req), submitted)) {
    res.status(403).json({ error: "Invalid CSRF token.", code: "admin_csrf_invalid" });
    return;
  }
  next();
}

function sendError(res: Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function formRedirect(res: Response, fallbackJson: unknown) {
  const accepts = String(res.req.headers.accept ?? "");
  if (accepts.includes("text/html")) {
    const returnTo = String((res.req as Request).body?.returnTo ?? "");
    res.redirect(returnTo.startsWith("/admin/") ? returnTo : "/admin/support");
  } else {
    res.json(fallbackJson);
  }
}

function formatDate(value: unknown) {
  try {
    const timestamp = value as { toDate?: () => Date } | null | undefined;
    const date = timestamp && typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "-";
  }
}

function statusClass(status: unknown) {
  const value = String(status ?? "").toLowerCase();
  if (value === "replied" || value === "resolved" || value === "closed") return "ok";
  if (value === "open" || value === "pending") return "warn";
  return "muted";
}

function attachmentIsActive(value: unknown) {
  try {
    const timestamp = value as { toDate?: () => Date } | null | undefined;
    const date = timestamp && typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(String(value ?? ""));
    return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
  } catch {
    return false;
  }
}

function renderAttachmentSummary(d: Record<string, unknown>) {
  const attachmentUrl = String(d.adminAttachmentUrl ?? "").trim();
  const attachmentName = String(d.adminAttachmentName ?? "").trim();
  const attachmentMimeType = String(d.adminAttachmentMimeType ?? "").trim();
  const attachmentExpiresAt = d.adminAttachmentExpiresAt;
  if (!attachmentUrl || !attachmentName || !attachmentIsActive(attachmentExpiresAt)) {
    return `<div class="small muted" style="margin-top:8px">No attachment on this reply.</div>`;
  }
  return `<div class="attachment-box" style="margin-top:8px"><div class="small muted">Attachment available until ${htmlEscape(formatDate(attachmentExpiresAt))}</div><div class="attachment-actions"><a class="attachment-chip" href="${htmlEscape(attachmentUrl)}" target="_blank" rel="noreferrer"><span>⬇</span><span>${htmlEscape(attachmentName)}</span></a><span class="small muted">${htmlEscape(attachmentMimeType || "file")}</span></div></div>`;
}

async function loadSupportTickets(limit = 200) {
  const snap = await getFirestoreDb().collection("supportTickets").orderBy("createdAt", "desc").limit(limit).get();
  return Promise.all(snap.docs.map(async (doc) => {
    const d = { ...doc.data() } as Record<string, unknown>;
    const cleared = await cleanupExpiredSupportAttachment(d, doc.ref).catch(() => null);
    const normalized = { id: doc.id, ...d, ...(cleared ?? {}) };
    return { doc, data: normalized };
  }));
}

adminSupportPanelRouter.get("/support", requireAdminPanel, async (req, res) => {
  try {
    const tickets = await loadSupportTickets(200);
    const rows = tickets.map(({ data }) => {
      const ticketId = String(data.ticketId ?? data.id ?? "");
      const adminReply = String(data.adminReply ?? "").trim();
      const status = String(data.status ?? "open");
      return `<tr>
        <td><div>${htmlEscape(data.deviceId ?? data.userId ?? "-")}</div><div class="small muted">${htmlEscape(ticketId)}</div></td>
        <td>${htmlEscape(data.issueType ?? "Support")}</td>
        <td><div style="white-space:pre-wrap">${htmlEscape(data.message)}</div><div class="small muted">Created: ${htmlEscape(formatDate(data.createdAt))}</div></td>
        <td><span class="${statusClass(status)}">${htmlEscape(status.toUpperCase())}</span>${adminReply ? `<div class="reply" style="margin-top:8px">${htmlEscape(adminReply)}</div><div class="small muted">Last reply: ${htmlEscape(formatDate(data.lastReplyAt))}</div>${renderAttachmentSummary(data)}` : `<div class="small muted" style="margin-top:8px">No admin reply yet.</div>`}</td>
        <td>
          <form class="stack" method="post" action="/api/admin/support/${encodeURIComponent(ticketId)}/reply">
            <textarea class="input" name="reply" rows="4" required placeholder="Write reply to user">${htmlEscape(adminReply)}</textarea>
            <input class="input" name="resolutionNotes" placeholder="Internal note, optional" value="${htmlEscape(data.resolutionNotes)}" />
            ${supportAttachmentFields()}
            <div class="actions"><button class="btn green" type="submit">Send Reply</button></div>
          </form>
          <form method="post" action="/api/admin/support/${encodeURIComponent(ticketId)}/close" style="margin-top:8px"><button class="btn" type="submit">Close</button></form>
        </td>
      </tr>`;
    }).join("");

    const content = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px">
        <div><h1 style="margin:0">Support Reply Center</h1><div class="muted">Reply to user support tickets, attach image or audio files, and update their status.</div></div>
        <a class="btn gold" href="/admin/dashboard">Back to Dashboard</a>
      </div>
      <div class="card"><table><thead><tr><th>User</th><th>Issue</th><th>Message</th><th>Status / Current Reply</th><th>Admin Reply</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">No support tickets found.</td></tr>'}</tbody></table></div>
    `;
    res.send(supportShell(content, getAdminCsrfToken(readSession(req))));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load support tickets.";
    res.status(500).send(supportShell(`<div class="card"><h1>Support Reply Center</h1><p class="danger">${htmlEscape(message)}</p><a class="btn" href="/admin/dashboard">Back</a></div>`, getAdminCsrfToken(readSession(req))));
  }
});

adminSupportApiRouter.use(requireAdmin);
adminSupportApiRouter.use(requireAdminCsrf);

adminSupportApiRouter.post("/support/:ticketId/reply", async (req, res) => {
  try {
    const reply = String(req.body?.reply ?? "").trim();
    const resolutionNotes = String(req.body?.resolutionNotes ?? "").trim();
    const attachmentBase64 = String(req.body?.attachmentBase64 ?? "").trim();
    const attachmentName = String(req.body?.attachmentName ?? "").trim();
    const attachmentMimeType = String(req.body?.attachmentMimeType ?? "").trim();
    const attachmentExpiresInHours = Number(req.body?.attachmentExpiresInHours ?? 24);
    if (reply.length < 2) {
      res.status(400).json({ error: "Reply must be at least 2 characters.", code: "invalid_support_reply" });
      return;
    }

    const ticketId = String(req.params.ticketId);
    const ref = await findSupportTicketRef(ticketId);
    if (!ref) {
      res.status(404).json({ error: "Support ticket not found.", code: "support_ticket_not_found" });
      return;
    }

    const attachment = await storeSupportAttachment({
      ticketId,
      attachmentBase64: attachmentBase64 || null,
      attachmentName: attachmentName || null,
      attachmentMimeType: attachmentMimeType || null,
      expiresInHours: Number.isFinite(attachmentExpiresInHours) ? attachmentExpiresInHours : 24,
    });

    const lastReplyAt = nowTs();
    await ref.set({
      adminReply: reply,
      resolutionNotes: resolutionNotes || null,
      status: "replied",
      lastReplyAt,
      updatedAt: lastReplyAt,
      ...(attachment ?? {}),
    }, { merge: true });

    await notifySupportTicket(ticketId, "reply", attachment ? `${reply}\n\nAttachment: ${attachment.adminAttachmentName}` : reply);
    formRedirect(res, { success: true, message: "Reply sent to user." });
  } catch (err) {
    sendError(res, err, "Unable to send support reply.");
  }
});

adminSupportApiRouter.post("/support/:ticketId/close", async (req, res) => {
  try {
    const ticketId = String(req.params.ticketId);
    const ref = await findSupportTicketRef(ticketId);
    if (!ref) {
      res.status(404).json({ error: "Support ticket not found.", code: "support_ticket_not_found" });
      return;
    }

    const resolutionNotes = String(req.body?.resolutionNotes ?? "").trim();
    await ref.set({
      status: "closed",
      resolutionNotes: resolutionNotes || null,
      updatedAt: nowTs(),
    }, { merge: true });

    await notifySupportTicket(ticketId, "closed", resolutionNotes || "Your support ticket has been closed.");
    formRedirect(res, { success: true, message: "Ticket closed." });
  } catch (err) {
    sendError(res, err, "Unable to close support ticket.");
  }
});

adminSupportApiRouter.get("/support-with-replies", async (_req, res) => {
  try {
    const tickets = await loadSupportTickets(200);
    res.json(tickets.map(({ data }) => serializeDoc(data)));
  } catch (err) {
    sendError(res, err, "Unable to load support tickets.");
  }
});

export function enhanceAdminDashboardSupportLink(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" || req.path !== "/dashboard") {
    next();
    return;
  }

  const originalSend = res.send.bind(res);
  res.send = ((body?: any): Response => {
    let nextBody = body;
    if (typeof body === "string" && body.includes("Support Tickets") && !body.includes("data-support-dashboard-replies")) {
      const supportTools = `<div class="actions" data-support-dashboard-replies="true" style="margin:8px 0 12px"><a class="btn green" href="/admin/support">Open Reply Center</a><span class="muted small">Reply directly below. Users get a notification when you send a reply.</span></div>`;
      const supportScript = `<script>(function(){var forms=[].slice.call(document.querySelectorAll('form[action*="/api/admin/support/"][action$="/close"]'));forms.forEach(function(closeForm){var cell=closeForm.parentElement;if(!cell||cell.querySelector('[data-support-reply-form]'))return;var csrf=closeForm.querySelector('input[name="_csrf"]');var replyForm=document.createElement('form');replyForm.method='post';replyForm.action=closeForm.action.replace(/\/close$/,'/reply');replyForm.className='stack';replyForm.setAttribute('data-support-reply-form','true');if(csrf)replyForm.appendChild(csrf.cloneNode(true));var returnTo=document.createElement('input');returnTo.type='hidden';returnTo.name='returnTo';returnTo.value='/admin/dashboard';replyForm.appendChild(returnTo);if(!closeForm.querySelector('input[name="returnTo"]')){var closeReturn=document.createElement('input');closeReturn.type='hidden';closeReturn.name='returnTo';closeReturn.value='/admin/dashboard';closeForm.appendChild(closeReturn);}var textarea=document.createElement('textarea');textarea.className='input';textarea.name='reply';textarea.rows=3;textarea.required=true;textarea.placeholder='Write reply to user';textarea.style.minWidth='220px';textarea.style.marginBottom='6px';replyForm.appendChild(textarea);var actions=document.createElement('div');actions.className='actions';var send=document.createElement('button');send.className='btn green';send.type='submit';send.textContent='Send Reply';actions.appendChild(send);replyForm.appendChild(actions);cell.insertBefore(replyForm,closeForm);closeForm.style.marginTop='8px';});})();</script>`;
      nextBody = body
        .replace("<h3>Support Tickets</h3>", `<h3>Support Tickets</h3>${supportTools}`)
        .replace("</body>", `${supportScript}</body>`);
    }
    return originalSend(nextBody);
  }) as typeof res.send;

  next();
}