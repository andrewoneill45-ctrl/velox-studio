import { json, gated } from "./_lib.js";
import morning from "./morning.js";
export default gated(async () => { await morning(); return json({ ok: true, ran: new Date().toISOString() }); });
