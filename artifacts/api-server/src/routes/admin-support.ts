import { Router, type NextFunction, type Request, type Response } from "express";
import { getAdminCsrfToken, isAdminSession, validateAdminCsrfToken } from "../lib/admin-auth.js";
import { getFirestoreDb, handleRouteError, nowTs, serializeDoc } from "../services/firebase-admin.js";
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

function supportShell(content: string, csrfToken?: string) {
  const safeContent = injectCsrf(content, csrfToken);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Support Replies</title><style>body{margin:0;font-family:Inter,Arial,sans-serif;background:#080814;color:#fff}a,input,button,textarea{font:inherit}.wrap{max-width:1180px;margin:0 auto;padding:24px}.card{background:#131326;border:1px solid #2d2d4a;border-radius:18px;padding:18px}.muted{color:#9ca3af}.btn{background:#7c3aed;color:#fff;border:0;border-radius:12px;padding:10px 13px;cursor:pointer;text-decoration:none;display:inline-block}.btn.gold{background:#f59e0b;color:#160a00}.btn.red{background:#ef4444}.btn.green{background:#10b981}.input{width:100%;padding:10px 12px;border-radius:12px;border:1px solid #384163;background:#0d0d1a;color:#fff;box-sizing:border-box}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #2d2d4a;text-align:left;font-size:13px;vertical-align:top}.actions{display:flex;gap:6px;flex-wrap:wrap}.stack{display:grid;gap:8px}.small{font-size:12px}.ok{color:#86efac}.warn{color:#fcd34d}.danger{color:#fca5a5}.reply{background:#0d1b17;border:1px solid #1f5f48;border-radius:12px;padding:10px;white-space:pre-wrap}</style></head><body><div class="wrap">${safeContent}</div></body></html>`;
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
    res.redirect("/admin/support");
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

async function findSupportTicketRef(ticketId: string) {
  const db = getFirestoreDb();
  const directRef = db.collection("supportTickets").doc(ticketId);
  const directSnap = await directRef.get();
  if (directSnap.exists) return directRef;

  const querySnap = await db.collection("supportTickets").where("ticketId", "==", ticketId).limit(1).get();
  const first = querySnap.docs[0];
  return first?.ref ?? null;
}

adminSupportPanelRouter.get("/support", requireAdminPanel, async (req, res) => {
  try {
    const snap = await getFirestoreDb().collection("supportTickets").orderBy("createdAt", "desc").limit(200).get();
    const rows = snap.docs.map((doc) => {
      const d = doc.data();
      const ticketId = String(d.ticketId ?? doc.id);
      const adminReply = String(d.adminReply ?? "").trim();
      const status = String(d.status ?? "open");
      return `<tr>
        <td><div>${htmlEscape(d.deviceId ?? d.userId ?? "-")}</div><div class="small muted">${htmlEscape(ticketId)}</div></td>
        <td>${htmlEscape(d.issueType ?? "Support")}</td>
        <td><div style="white-space:pre-wrap">${htmlEscape(d.message)}</div><div class="small muted">Created: ${htmlEscape(formatDate(d.createdAt))}</div></td>
        <td><span class="${statusClass(status)}">${htmlEscape(status.toUpperCase())}</span>${adminReply ? `<div class="reply" style="margin-top:8px">${htmlEscape(adminReply)}</div><div class="small muted">Last reply: ${htmlEscape(formatDate(d.lastReplyAt))}</div>` : `<div class="small muted" style="margin-top:8px">No admin reply yet.</div>`}</td>
        <td>
          <form class="stack" method="post" action="/api/admin/support/${encodeURIComponent(ticketId)}/reply">
            <textarea class="input" name="reply" rows="4" required placeholder="Write reply to user">${htmlEscape(adminReply)}</textarea>
            <input class="input" name="resolutionNotes" placeholder="Internal note, optional" value="${htmlEscape(d.resolutionNotes)}" />
            <div class="actions"><button class="btn green" type="submit">Send Reply</button></div>
          </form>
          <form method="post" action="/api/admin/support/${encodeURIComponent(ticketId)}/close" style="margin-top:8px"><button class="btn" type="submit">Close</button></form>
        </td>
      </tr>`;
    }).join("");

    const content = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px">
        <div><h1 style="margin:0">Support Reply Center</h1><div class="muted">Reply to user support tickets and update their status.</div></div>
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

    const lastReplyAt = nowTs();
    await ref.set({
      adminReply: reply,
      resolutionNotes: resolutionNotes || null,
      status: "replied",
      lastReplyAt,
      updatedAt: lastReplyAt,
    }, { merge: true });

    await notifySupportTicket(ticketId, "reply", reply);
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
    const snap = await getFirestoreDb().collection("supportTickets").orderBy("createdAt", "desc").limit(200).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
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
    if (typeof body === "string" && body.includes("Support Tickets") && !body.includes("/admin/support")) {
      const supportTools = `<div class="actions" style="margin:8px 0 12px"><a class="btn green" href="/admin/support">Open Reply Center</a><span class="muted small">You can also reply directly from the boxes below.</span></div>`;
      const supportScript = `<script>(function(){var forms=[].slice.call(document.querySelectorAll('form[action*="/api/admin/support/"][action$="/close"]'));forms.forEach(function(closeForm){var cell=closeForm.parentElement;if(!cell||cell.querySelector('[data-support-reply-form]'))return;var replyForm=document.createElement('form');replyForm.method='post';replyForm.action=closeForm.action.replace(/\/close$/,'/reply');replyForm.className='stack';replyForm.setAttribute('data-support-reply-form','true');var csrf=closeForm.querySelector('input[name="_csrf"]');if(csrf)replyForm.appendChild(csrf.cloneNode(true));var textarea=document.createElement('textarea');textarea.className='input';textarea.name='reply';textarea.rows=3;textarea.required=true;textarea.placeholder='Write reply to user';replyForm.appendChild(textarea);var actions=document.createElement('div');actions.className='actions';var send=document.createElement('button');send.className='btn green';send.type='submit';send.textContent='Send Reply';actions.appendChild(send);replyForm.appendChild(actions);cell.insertBefore(replyForm,closeForm);closeForm.style.marginTop='8px';});})();</script>`;
      nextBody = body
        .replace("<h3>Support Tickets</h3>", `<h3>Support Tickets</h3>${supportTools}`)
        .replace("</body>", `${supportScript}</body>`);
    }
    return originalSend(nextBody);
  }) as typeof res.send;

  next();
}
