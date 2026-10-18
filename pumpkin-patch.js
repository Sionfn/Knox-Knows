// Shared, code-native pumpkin patch for the landing hero and Ask/Learn welcome.
// Decorative SVGs never capture input or enter the accessibility tree.
(() => {
  const pumpkin = (x,y,s,color='#E67925',rib='#BD511E') => `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cy="3" rx="43" ry="7" fill="#704925" opacity=".13"/>
    <path d="M-2-54q-6-16 5-23" fill="none" stroke="#6B4D2A" stroke-width="7" stroke-linecap="round"/>
    <path d="M4-65q12-16 25-5-9 13-25 5" fill="#788845"/><path d="M9-63q12-2 14 3t-6 4" fill="none" stroke="#788845" stroke-width="2"/>
    <path d="M0-54C-40-74-53-32-33-9Q-19 7 0-2Q23 8 37-13C53-42 34-70 0-54Z" fill="${color}" stroke="${rib}" stroke-width="2"/>
    <ellipse cy="-29" rx="23" ry="30" fill="${color}" stroke="${rib}" stroke-width="2"/>
    <ellipse cy="-29" rx="10" ry="29" fill="#FFCE73" opacity=".28"/>
    <path d="M-22-48q-12 12-9 28" fill="none" stroke="#FFE0A0" stroke-width="4" stroke-linecap="round" opacity=".45"/>
  </g>`;
  const bale=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><rect width="123" height="57" rx="9" fill="#D8A544" stroke="#A97832" stroke-width="2"/><path d="m4 10 113-3M7 19l111-3M5 30l113-4M7 40l110-3M4 49l112-3" stroke="#F3CD74" stroke-width="3"/><path d="M31 2v53M91 1v55" stroke="#976C39" stroke-width="5"/><path d="m12 4 5 10m39-10-4 9m55 19 9 2M14 35l7 2m29 8 12-2m39 9 8-4" stroke="#BB8431" stroke-width="2"/></g>`;
  const vine=`<path d="M10 190q25-18 49-6t50-1q25-17 45-5" fill="none" stroke="#7C8748" stroke-width="3"/><g fill="#89934E"><path d="M46 185q-23-25-29-8 9 15 29 8M94 186q17-25 28-12-6 18-28 12M143 180q-2-26-17-21-6 14 17 21"/></g>`;
  const svg=(cls,box,body)=>`<svg class="${cls}" viewBox="${box}" aria-hidden="true" focusable="false">${body}</svg>`;
  function mount(){
    const host=document.getElementById('welcomeScreen')||document.getElementById('home');
    const footer=host?.querySelector('.harvest-footer');
    if(!footer||footer.classList.contains('pumpkin-patch'))return;
    footer.classList.add('pumpkin-patch');
    host.querySelectorAll('.harvest-trunk,.harvest-bough,.harvest-tree-branches,.harvest-truck,.fall-harvest,.harvest-wheat').forEach(el=>el.remove());
    footer.insertAdjacentHTML('afterbegin',svg('patch-land','0 0 1200 180',`
      <path d="M0 70Q170 4 380 70T800 62T1200 38V180H0Z" fill="#D8B974"/>
      <path d="M0 106Q220 54 485 98T1200 83V180H0Z" fill="#C3AA67"/>
      <path d="M0 128Q340 105 610 135T1200 119V180H0Z" fill="#B88B55"/>
      <path d="M0 162Q240 136 500 160T1200 154V180H0Z" fill="#CDA46B"/>
      <g fill="none" stroke="#A57647" stroke-width="2" opacity=".4"><path d="M50 180q105-28 230-26m145 26q125-20 225-12m180 9q135-34 290-19"/></g>`));
    footer.querySelector('.patch-land').setAttribute('preserveAspectRatio','none');
    // Fence posts run down to the ground the pumpkins sit on, so the fence is planted, not floating.
    const fence = `<g fill="#B48A5C" stroke="#89623F" stroke-width="2" stroke-linejoin="round"><path d="M0 90 330 75v13L0 104ZM0 119l330-14v12L0 133ZM0 150l330-14v12L0 164Z"/>${[20,115,215,315].map((x,i)=>`<path d="m${x} ${65-i*4} 7-6 7 6V208h-14Z"/><ellipse cx="${x+7}" cy="208" rx="13" ry="3.5" fill="#8F6A43" opacity=".35" stroke="none"/>`).join('')}</g><g fill="#775236">${[27,122,222,322].map(x=>`<circle cx="${x}" cy="95" r="2"/><circle cx="${x}" cy="122" r="2"/><circle cx="${x}" cy="152" r="2"/>`).join('')}</g>`;
    footer.insertAdjacentHTML('beforeend',svg('patch-left','0 0 380 220',`
      ${fence}${bale(48,107,1.12)}
      <g transform="translate(225 39) rotate(-5)"><path d="M48 36v105" stroke="#7D5737" stroke-width="9"/><path d="M0 0h100l10 24-10 25H0Z" fill="#B87942" stroke="#805330" stroke-width="3"/><path d="M8 9h88M8 40h87" stroke="#D7A36B" stroke-width="2"/><text x="51" y="23" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-size="12" font-weight="900" fill="#FFF3D6">PUMPKIN</text><text x="51" y="37" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-size="11" font-weight="900" fill="#FFF3D6">PATCH</text></g>
      ${pumpkin(89,107,.65,'#F0BC62','#C28B3A')}${pumpkin(39,189,.82)}${pumpkin(122,200,1.12)}${pumpkin(205,198,.68,'#EFE0B3','#B5A47A')}${pumpkin(273,204,.55,'#D99236','#AE6B27')}${vine}
      <g fill="#8F793D"><path d="m319 199 2-23 7 22 9-15-4 18M7 197l-4-17 10 16 1-10 5 14"/></g>`));
    footer.insertAdjacentHTML('beforeend',svg('patch-right','0 0 380 220',`
      <g transform="translate(40 0)">${fence}</g>
      <g fill="none" stroke="#A28B42" stroke-width="4" stroke-linecap="round"><path d="M305 155 297 25M305 155l31-110M305 155l-28-98"/></g>
      <g fill="#B6A052"><path d="M300 93q-50-5-43-35 28 8 43 35M301 111q40-39 49-26-17 31-49 26M298 62q-26-19-17-39 15 8 17 39M308 133q38-28 43-13-15 18-43 13"/></g>
      <g fill="#EBC362" stroke="#BE9440" stroke-width="2"><ellipse cx="300" cy="76" rx="8" ry="22" transform="rotate(-8 300 76)"/><path d="m296 59 6 34m-10-23 15-2m-13 11 15-2" fill="none"/></g>
      ${bale(221,124,1.05)}${pumpkin(280,123,.62,'#EEE0B5','#B5A47A')}${pumpkin(327,204,1.03)}${pumpkin(236,206,.77,'#E4AE4F','#BD8231')}${pumpkin(157,205,.87)}${pumpkin(91,202,.51,'#EFE0B3','#B5A47A')}
      <g transform="translate(206 12)">${vine}</g><g fill="#8F793D"><path d="m48 202 2-24 6 22 9-14-5 18M369 200l-4-19-5 18-7-8 4 12"/></g>`));
    // Small pumpkins recede into the field between the two foreground clusters.
    footer.insertAdjacentHTML('afterbegin',svg('patch-distance','0 0 420 110',`
      ${pumpkin(40,78,.28,'#C77D35','#A1652E')}${pumpkin(114,69,.22,'#E3B363','#B78A45')}${pumpkin(195,81,.32,'#D18B3C','#AD7130')}${pumpkin(281,70,.23,'#C77D35','#A1652E')}${pumpkin(364,83,.3,'#E3B363','#B78A45')}`));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
