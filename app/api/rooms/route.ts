import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const token = () => crypto.randomUUID() + crypto.randomUUID();
type Room = { code: string; host_token: string; guest_token: string | null; host_seen: number; guest_seen: number; state: string; input: string; revision: number };

export async function POST(request: Request) {
  if (!env.DB) return json({ error: "The room server is unavailable. You can still play locally." }, 503);
  try {
    if (Number(request.headers.get("content-length") || 0) > 24000) return json({ error: "Request too large." }, 413);
    const body = await request.json() as Record<string, unknown>;
    if (JSON.stringify(body).length > 24000) return json({ error: "Request too large." }, 413);
    const now = Date.now();
    if (body.action === "create") {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), n => ALPHABET[n % ALPHABET.length]).join("");
      const secret = token();
      await env.DB.prepare("DELETE FROM rooms WHERE host_seen < ? AND guest_seen < ?").bind(now - 1800000, now - 1800000).run();
      await env.DB.prepare("INSERT INTO rooms (code,host_token,host_seen) VALUES (?,?,?)").bind(code, secret, now).run();
      return json({ code, token: secret, role: "host" });
    }
    const code = String(body.code || "").toUpperCase().replace(/\s/g, "");
    if (!/^[A-Z2-9]{8}$/.test(code)) return json({ error: "Enter the 8-character room code." }, 400);
    if (body.action === "join") {
      const secret = token();
      const claimed = await env.DB.prepare("UPDATE rooms SET guest_token=?, guest_seen=?, input='{}' WHERE code=? AND guest_token IS NULL AND host_seen > ? RETURNING code")
        .bind(secret, now, code, now - 30000).first();
      if (!claimed) {
        const exists = await env.DB.prepare("SELECT host_seen,guest_token FROM rooms WHERE code=?").bind(code).first<Room>();
        return json({ error: !exists || exists.host_seen < now - 30000 ? "This room is offline. Ask your friend to create a new room." : "This room already has two players." }, 409);
      }
      return json({ code, token: secret, role: "guest" });
    }
    const room = await env.DB.prepare("SELECT * FROM rooms WHERE code=?").bind(code).first<Room>();
    if (!room) return json({ error: "Room expired. Create a new room." }, 404);
    const host = body.token === room.host_token;
    const guest = Boolean(room.guest_token && body.token === room.guest_token);
    if (!host && !guest) return json({ error: "Room session expired. Please rejoin." }, 403);
    if (body.action === "leave") {
      if (host) await env.DB.prepare("DELETE FROM rooms WHERE code=?").bind(code).run();
      else await env.DB.prepare("UPDATE rooms SET guest_token=NULL,guest_seen=0,input='{}' WHERE code=? AND guest_token=?").bind(code, body.token).run();
      return json({ ok: true });
    }
    if (body.action !== "sync") return json({ error: "Unknown room action." }, 400);
    if (host) {
      const state = body.state;
      if (!state || typeof state !== "object" || !Array.isArray((state as Record<string, unknown>).players)) return json({ error: "Invalid game state." }, 400);
      const update = state as Record<string, unknown>;
      const modern = update.protocol === 2;
      const packet = Math.max(0, Math.min(1e12, Number(update.packet) || 0));
      await env.DB.prepare(modern
        ? "UPDATE rooms SET state=?,host_seen=?,revision=revision+1 WHERE code=? AND host_token=? AND COALESCE(json_extract(state,'$.packet'),-1) < ?"
        : "UPDATE rooms SET state=?,host_seen=?,revision=revision+1 WHERE code=? AND host_token=? AND COALESCE(json_extract(state,'$.protocol'),0) <> ?")
        .bind(JSON.stringify(state), now, code, body.token, modern ? packet : 2).run();
      const digest=room.guest_token?await crypto.subtle.digest("SHA-256",new TextEncoder().encode(room.guest_token)):null;
      const guestSession=digest?Array.from(new Uint8Array(digest)).slice(0,8).map(n=>n.toString(16).padStart(2,"0")).join(""):null;
      return json({ input: room.guest_seen > now - 2500 ? JSON.parse(room.input) : {}, guestSession, connected: room.guest_seen > now - 5000, peerSeen: room.guest_seen, serverTime: now });
    }
    const source = body.input as Record<string, unknown> || {};
    const input = { seq:Math.max(0,Math.min(1e12,Number(source.seq)||0)), left: !!source.left, right: !!source.right, gate:Math.max(0,Math.min(1e9,Number(source.gate)||0)), jump: Math.max(0, Math.min(1e9, Number(source.jump) || 0)), lock: Math.max(0, Math.min(1e9, Number(source.lock) || 0)), restart: Math.max(0, Math.min(1e9, Number(source.restart) || 0)) };
    Object.assign(input,{leftFrames:Math.max(0,Math.min(1e12,Number(source.leftFrames)||0)),rightFrames:Math.max(0,Math.min(1e12,Number(source.rightFrames)||0))});
    Object.assign(input,{rewind:!!source.rewind,switchHeld:!!source.switchHeld,switch:Math.max(0,Math.min(1e9,Number(source.switch)||0)),confirm:Math.max(0,Math.min(1e9,Number(source.confirm)||0)),menu:Math.max(0,Math.min(1e9,Number(source.menu)||0))});
    const bound=(value:unknown,ceiling=1e9)=>Math.max(0,Math.min(ceiling,Math.floor(Number(value)||0)));
    const protocol=source.protocol===2?2:0,packet=bound(source.packet,1e12);
    const frames=Array.isArray(source.frames)?source.frames.slice(0,180).filter((f:unknown)=>Array.isArray(f)&&f.length===7).map((f:unknown[])=>f.map((v,i)=>bound(v,i===0?1e12:i===1?15:1e9))):[];
    Object.assign(input,{protocol,packet,epoch:bound(source.epoch),stream:bound(source.stream),frames});
    await env.DB.prepare(protocol===2
      ? "UPDATE rooms SET input=?,guest_seen=? WHERE code=? AND guest_token=? AND COALESCE(json_extract(input,'$.packet'),-1) < ?"
      : "UPDATE rooms SET input=?,guest_seen=? WHERE code=? AND guest_token=? AND COALESCE(json_extract(input,'$.protocol'),0) <> ?")
      .bind(JSON.stringify(input), now, code, body.token, protocol===2?packet:2).run();
    return json({ state: JSON.parse(room.state), connected: room.host_seen > now - 5000, revision: room.revision, serverTime: now });
  } catch {
    return json({ error: "The room server could not complete that request. Try again." }, 500);
  }
}
