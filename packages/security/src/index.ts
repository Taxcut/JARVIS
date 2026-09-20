import {
  capabilitySchema,
  decisionSchema,
  riskSchema,
  type Capability,
  type Risk,
  type Decision,
} from '@jarvis/schemas';
export const capabilities: Readonly<Record<Capability, Risk>> = Object.freeze({
  'device.status.read': 'LOW',
  'device.process.list': 'MEDIUM',
  'device.app.launch': 'MEDIUM',
  'device.app.close': 'HIGH',
  'device.power.restart': 'CRITICAL',
  'device.power.shutdown': 'CRITICAL',
  'files.search': 'MEDIUM',
  'files.read': 'MEDIUM',
  'files.write': 'HIGH',
  'terminal.execute': 'CRITICAL',
  'screen.capture': 'HIGH',
  'screen.inspect': 'HIGH',
  'remote.connect': 'CRITICAL',
  'phone.call': 'HIGH',
  'sms.send': 'HIGH',
  'memory.read': 'MEDIUM',
  'memory.write': 'MEDIUM',
});
export interface PolicyRule {
  capability: Capability;
  decision: Decision;
}
export interface PolicyContext {
  trusted: boolean;
  revoked: boolean;
  lockdown: boolean;
  grantedCapabilities: readonly Capability[];
  rules: readonly PolicyRule[];
}
export interface PolicyResult {
  decision: Decision;
  risk: Risk | null;
  reason: string;
  executionAuthorized: false;
}
// This evaluates policy only. No result is an execution credential.
export function evaluatePolicy(raw: unknown, ctx: PolicyContext): PolicyResult {
  const parsed = capabilitySchema.safeParse(raw);
  const result = (
    decision: Decision,
    risk: Risk | null,
    reason: string,
  ): PolicyResult => ({ decision, risk, reason, executionAuthorized: false });
  if (!parsed.success) return result('DENY', null, 'UNKNOWN_CAPABILITY');
  const capability = parsed.data;
  const risk = riskSchema.parse(capabilities[capability]);
  if (ctx.lockdown || ctx.revoked || !ctx.trusted)
    return result('DENY', risk, 'DEVICE_NOT_AUTHORIZED');
  if (!ctx.grantedCapabilities.includes(capability))
    return result('DENY', risk, 'CAPABILITY_NOT_GRANTED');
  const rules = ctx.rules.filter((r) => r.capability === capability);
  if (
    rules.some(
      (r) =>
        !decisionSchema.safeParse(r.decision).success || r.decision === 'DENY',
    )
  )
    return result('DENY', risk, 'POLICY_DENIED');
  if (rules.some((r) => r.decision === 'ASK'))
    return result('ASK', risk, 'APPROVAL_REQUIRED');
  if (risk === 'LOW' && rules.some((r) => r.decision === 'ALLOW'))
    return result('ALLOW', risk, 'EXPLICIT_LOW_RISK_RULE');
  return result('ASK', risk, 'APPROVAL_REQUIRED');
}
