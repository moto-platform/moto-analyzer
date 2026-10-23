import { Defs } from '../defs/model';

/**
 * UDS request checks and composition, driven by moto-vehicle-defs
 * (uds/vehicle_cl250.yaml -> tester_policy, uds/iso14229.yaml names).
 *
 * The analyzer is not a tester on the vehicle bus (Invariant 1: one tester, rt-core).
 * Composed requests go only to the simulated ECU of the virtual bus; on a real bus the
 * policy check is used to flag what the real tester sends.
 */

export interface PolicyVerdict {
  allowed: boolean;
  reason?: string;
}

const hex = (n: number, w = 2) => `0x${n.toString(16).toUpperCase().padStart(w, '0')}`;

/** Checks a request payload (SID first) against tester_policy. Sub-function checks ignore bit 7. */
export function checkTesterPolicy(defs: Defs, payload: number[]): PolicyVerdict {
  const policy = defs.vehicle.testerPolicy;
  if (payload.length === 0) return { allowed: false, reason: 'empty request' };
  const sid = payload[0];
  const name = defs.iso.services.get(sid) ?? policy.allowed.find((a) => a.sid === sid)?.name ?? 'unknown service';

  if (policy.forbidden.includes(sid)) {
    return { allowed: false, reason: `${hex(sid)} ${name} is forbidden by tester_policy (Invariant 1: the ECU is read-only)` };
  }
  const entry = policy.allowed.find((a) => a.sid === sid);
  if (!entry) return { allowed: false, reason: `${hex(sid)} ${name} is not in the tester_policy allow-list` };

  const suppress = defs.iso.suppressPosRspBit;
  const forbiddenSubs = policy.forbiddenSubfunctions.find((f) => f.sid === sid)?.subfunctions ?? [];
  if (entry.subfunctions || forbiddenSubs.length > 0) {
    if (payload.length < 2) return { allowed: false, reason: `${hex(sid)} ${entry.name} needs a sub-function` };
    const sub = payload[1] & ~suppress;
    if (forbiddenSubs.includes(sub)) {
      return { allowed: false, reason: `sub-function ${hex(sub)} of ${hex(sid)} is forbidden by tester_policy` };
    }
    if (entry.subfunctions && !entry.subfunctions.includes(sub)) {
      return { allowed: false, reason: `sub-function ${hex(sub)} of ${hex(sid)} is not allowed (allowed: ${entry.subfunctions.map((s) => hex(s)).join(', ')})` };
    }
  }
  return { allowed: true };
}

export interface ComposerService {
  sid: number;
  name: string;
  allowed: boolean;
  /** Sub-functions offered in the composer (allowed ones only). */
  subFunctions?: { id: number; name: string }[];
  takesDid: boolean;
}

/** Services shown in the composer: the policy allow-list, then the forbidden list (disabled). */
export function composerServices(defs: Defs): ComposerService[] {
  const policy = defs.vehicle.testerPolicy;
  const subNames = (sid: number): Map<number, string> | undefined =>
    sid === 0x10 ? defs.iso.sessions : sid === 0x19 ? defs.iso.readDtcSubfunctions : sid === 0x3e ? new Map([[0x00, 'ZERO_SUBFUNCTION']]) : undefined;

  const allowed: ComposerService[] = policy.allowed.map((a) => {
    const names = subNames(a.sid);
    let subFunctions: { id: number; name: string }[] | undefined;
    if (a.subfunctions) subFunctions = a.subfunctions.map((id) => ({ id, name: names?.get(id) ?? hex(id) }));
    else if (names) subFunctions = [...names.entries()].map(([id, name]) => ({ id, name }));
    return {
      sid: a.sid,
      name: defs.iso.services.get(a.sid) ?? a.name,
      allowed: true,
      subFunctions,
      takesDid: a.sid === 0x22,
    };
  });
  const forbidden: ComposerService[] = policy.forbidden.map((sid) => ({
    sid,
    name: defs.iso.services.get(sid) ?? 'forbidden service',
    allowed: false,
    takesDid: false,
  }));
  return [...allowed, ...forbidden];
}

export interface ComposedRequest {
  valid: boolean;
  errorMessage?: string;
  payload: number[];
  /** The padded ISO-TP Single Frame (requests never need more, D-059). */
  canFrameData: number[];
}

export function composeUdsRequest(defs: Defs, payload: number[]): ComposedRequest {
  const fail = (errorMessage: string): ComposedRequest => ({ valid: false, errorMessage, payload, canFrameData: [] });
  const verdict = checkTesterPolicy(defs, payload);
  if (!verdict.allowed) return fail(`BLOCKED: ${verdict.reason}`);
  if (payload.length > 7) return fail(`a request of ${payload.length} bytes needs a First Frame; the tester sends Single Frames only (D-059)`);
  const data = [payload.length, ...payload];
  while (data.length < 8) data.push(defs.vehicle.paddingByte);
  return { valid: true, payload, canFrameData: data };
}
