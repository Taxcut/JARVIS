import { build } from 'esbuild';
// Browser code is bundled locally, never loaded from a third-party CDN.
export async function browserScript(): Promise<string> {
  const result = await build({
    stdin: {
      contents: `
    import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
    const params = new URLSearchParams(location.hash.slice(1));
    const id=params.get('id'), secret=params.get('secret');
    history.replaceState(null,'',location.pathname);
    const button=document.querySelector('button'), status=document.querySelector('[role=status]');
    button.disabled=true;
    const call=async(path,extra={})=>{const r=await fetch('/api/v1/auth/browser/'+path,{method:'POST',credentials:'omit',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,id,secret,...extra})});if(!r.ok)throw Error('Authentication could not be completed. Return to JARVIS and try again.');return r.json()};
    button.addEventListener('click',async()=>{button.disabled=true;try{status.textContent='Confirm with your passkey when prompted.';const o=await call('options');const response=await(o.register?startRegistration({optionsJSON:o.options}):startAuthentication({optionsJSON:o.options}));await call('verify',{response});status.textContent='Verified. Return to JARVIS. You may close this tab.'}catch(e){status.textContent=e instanceof Error?e.message:'Authentication cancelled.'}});
    if(!id||!secret){status.textContent='Start authentication from the JARVIS desktop.'}
    else call('context').then(c=>{document.querySelector('#operation').textContent=c.operation+'. Device: '+c.deviceName+' · '+c.fingerprint.slice(0,16);button.disabled=false}).catch(()=>{status.textContent='This ceremony is unavailable. Start again from JARVIS.'});
  `,
      resolveDir: import.meta.dirname,
      loader: 'js',
    },
    bundle: true,
    write: false,
    minify: true,
    platform: 'browser',
    format: 'iife',
  });
  return result.outputFiles[0]!.text;
}
export const browserHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JARVIS · Owner verification</title><link rel="stylesheet" href="/auth/style.css"></head><body><main><p>J A R V I S</p><h1>Owner verification</h1><p>Your passkey stays with your browser and operating system.</p><p id="operation"></p><button type="button">Continue with passkey</button><p role="status">Ready when you are, Sir.</p></main><script src="/auth/browser.js" defer></script></body></html>`;
export const browserCss = `:root{color-scheme:dark;font:16px system-ui;background:#070c12;color:#dae7ef}body{display:grid;place-items:center;min-height:90vh}main{max-width:34rem;padding:3rem;border:1px solid #213444;border-radius:16px}h1{font-weight:400}p{line-height:1.7;color:#9db0bd}button{background:#153a47;color:#bcf4ff;border:1px solid #4c8895;border-radius:8px;padding:1rem;font:inherit;cursor:pointer}button:disabled{opacity:.6}`;
