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
  const bale=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="61" cy="57" rx="66" ry="5" fill="#704925" opacity=".16"/><rect width="123" height="57" rx="9" fill="#D8A544" stroke="#A97832" stroke-width="2"/><path d="m4 10 113-3M7 19l111-3M5 30l113-4M7 40l110-3M4 49l112-3" stroke="#F3CD74" stroke-width="3"/><path d="M31 2v53M91 1v55" stroke="#976C39" stroke-width="5"/><path d="m12 4 5 10m39-10-4 9m55 19 9 2M14 35l7 2m29 8 12-2m39 9 8-4" stroke="#BB8431" stroke-width="2"/></g>`;
  const svg=(cls,box,body)=>`<svg class="${cls}" viewBox="${box}" aria-hidden="true" focusable="false">${body}</svg>`;
  const sunflower=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 0Q-5-40 0-88" fill="none" stroke="#708244" stroke-width="4"/>
    <path d="M-2-31q-32-2-25-22 23 0 25 22M-1-51q29-25 32-7-6 17-32 7" fill="#8E9B51" stroke="#708244" stroke-width="1.5"/>
    <g transform="translate(0 -88)">${Array.from({length:10},(_,i)=>`<ellipse cy="-15" rx="6" ry="12" transform="rotate(${i*36})" fill="${i%2?'#E8AC35':'#F4C653'}" stroke="#C78C2C" stroke-width="1"/>`).join('')}<circle r="11" fill="#735133"/><circle r="7" fill="#926438"/><path d="M-4-3h1m5 0h1m-5 5h1" stroke="#E4B46B" stroke-width="2" stroke-linecap="round"/></g></g>`;
  const scarecrow=`<g class="patch-scarecrow" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="172" cy="209" rx="18" ry="3" fill="#704925" opacity=".18"/>
    <path d="M172 208V66M125 104l94 5" stroke="#89623F" stroke-width="7"/>
    <path d="m150 146 1 35 14 2 8-31 10 31 14-3-4-35" fill="#718887" stroke="#4F696A" stroke-width="2"/>
    <path d="m151 181-7 9m14-8-2 9m34-10 8 7m-2-9 9 4" stroke="#D9AF55" stroke-width="3"/>
    <path d="m153 95-28 4-12 18 14 6 19-12-2 39 53 0-5-38 24 12 10-14-32-15Z" fill="#C96738" stroke="#9C4D2E" stroke-width="2"/>
    <path d="M157 99v46m17-47v47m17-38v38M145 119h49m-49 15h50" fill="none" stroke="#F0B978" stroke-width="2" opacity=".65"/>
    <path d="m113 117-9 1m10 3-8 6m116-10 10 1m-12 4 8 6" stroke="#D9AF55" stroke-width="3"/>
    <rect x="178" y="129" width="12" height="13" rx="2" fill="#E6B15C" stroke="#9C4D2E"/>
    <circle cx="173" cy="77" r="19" fill="#F0CE8A" stroke="#BF9454" stroke-width="2"/>
    <path d="m155 66-12 5m13 2-12 7m46-13 12 5m-12 2 12 6" stroke="#D9AF55" stroke-width="3"/>
    <circle cx="166" cy="77" r="2" fill="#63452E"/><circle cx="180" cy="77" r="2" fill="#63452E"/>
    <path d="m173 80-3 5h6Z" fill="#C46B3C"/><path d="M165 88q8 6 16-1" fill="none" stroke="#805332" stroke-width="2"/>
    <path d="m159 60 5-23 25 6 4 20" fill="#B98B45" stroke="#8C632F" stroke-width="2"/><path d="m149 62q24-7 50 4" fill="none" stroke="#8C632F" stroke-width="8"/><path d="m162 53 28 4" stroke="#C96738" stroke-width="5"/>
    <path d="m158 96 15 8 15-8-4 14-11-6-8 13-5-14" fill="#718244" stroke="#596C35" stroke-width="1.5"/>
  </g>`;
  const wagon=`<g class="patch-wagon">
    <ellipse cx="161" cy="209" rx="76" ry="5" fill="#704925" opacity=".18"/>
    <path d="M111 187 64 156" fill="none" stroke="#785334" stroke-width="4" stroke-linecap="round"/>
    <rect x="45" y="143" width="24" height="13" rx="6.5" transform="rotate(33 64 156)" fill="none" stroke="#785334" stroke-width="4"/>
    <circle cx="111" cy="187" r="5" fill="#B89158" stroke="#785334" stroke-width="2"/>
    ${pumpkin(123,162,.48,'#EDB557','#BC8435')}${pumpkin(162,158,.62)}${pumpkin(204,162,.43,'#EFE0B3','#B5A47A')}
    <path d="m92 153 136 0-8 35H100Z" fill="#B8753C" stroke="#805333" stroke-width="3"/>
    <path d="M99 164h123m-120 12h117" stroke="#DEA365" stroke-width="3"/><path d="M114 155v30m94-30v30" stroke="#805333" stroke-width="4"/>
    ${[116,206].map(x=>`<circle cx="${x}" cy="193" r="15" fill="#634D37" stroke="#4F3D2C" stroke-width="2"/><circle cx="${x}" cy="193" r="9" fill="#D4B784"/><path d="M${x-8} 193h16m-8-8v16" stroke="#9B7B4B" stroke-width="2"/><circle cx="${x}" cy="193" r="3" fill="#795D3B"/>`).join('')}
  </g>`;
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
      <g fill="none" stroke="#A57647" stroke-width="2" opacity=".4"><path d="M50 180q105-28 230-26m145 26q125-20 225-12m180 9q135-34 290-19"/></g>
      <g opacity=".9">${bale(132,70,.42)}${pumpkin(207,97,.22,'#E6AA49','#B77B35')}${bale(1025,57,.4)}${pumpkin(1008,88,.25)}${sunflower(1100,87,.36)}${sunflower(1120,91,.28)}</g>`));
    footer.querySelector('.patch-land').setAttribute('preserveAspectRatio','none');
    // The fence keeps its size and is lowered onto the ground the pumpkins sit on, so it isn't floating.
    // Everything stands on one ground line (y≈208): fence posts, hay bales, the
    // sign post and the corn (its base hides behind the bale) — nothing floats.
    const fence = `<g transform="translate(0 56)"><g fill="#B48A5C" stroke="#89623F" stroke-width="2" stroke-linejoin="round"><path d="M0 90 330 75v13L0 104ZM0 119l330-14v12L0 133Z"/>${[20,115,215,315].map((x,i)=>`<path d="m${x} ${65-i*4} 7-6 7 6v${87+i*4}h-14Z"/><ellipse cx="${x+7}" cy="152" rx="13" ry="3.5" fill="#8F6A43" opacity=".35" stroke="none"/>`).join('')}</g><g fill="#775236">${[27,122,222,322].map(x=>`<circle cx="${x}" cy="95" r="2"/><circle cx="${x}" cy="122" r="2"/>`).join('')}</g></g>`;
    footer.insertAdjacentHTML('beforeend',svg('patch-left','0 0 380 220',`
      ${fence}${bale(48,144,1.12)}
      <path d="M273 84V208" stroke="#7D5737" stroke-width="9"/><ellipse cx="273" cy="209" rx="10" ry="3" fill="#704925" opacity=".2"/><g transform="translate(225 48) rotate(-5 48 24)"><path d="M0 0h100l10 24-10 25H0Z" fill="#B87942" stroke="#805330" stroke-width="3"/><path d="M8 9h88M8 40h87" stroke="#D7A36B" stroke-width="2"/><text x="51" y="23" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-size="12" font-weight="900" fill="#FFF3D6">PUMPKIN</text><text x="51" y="37" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-size="11" font-weight="900" fill="#FFF3D6">PATCH</text></g>
      ${pumpkin(89,144,.65,'#F0BC62','#C28B3A')}${pumpkin(39,208,.82)}${pumpkin(122,208,1.12)}${pumpkin(205,208,.68,'#EFE0B3','#B5A47A')}${pumpkin(273,208,.55,'#D99236','#AE6B27')}`));
    footer.insertAdjacentHTML('beforeend',svg('patch-right','0 0 380 220',`
      <g transform="translate(40 0)">${fence}</g>
      <g fill="none" stroke="#A28B42" stroke-width="4" stroke-linecap="round"><path d="M305 155 297 25M305 155l31-110M305 155l-28-98"/></g>
      <g fill="#B6A052"><path d="M300 93q-50-5-43-35 28 8 43 35M301 111q40-39 49-26-17 31-49 26M298 62q-26-19-17-39 15 8 17 39M308 133q38-28 43-13-15 18-43 13"/></g>
      <g fill="#EBC362" stroke="#BE9440" stroke-width="2"><ellipse cx="300" cy="76" rx="8" ry="22" transform="rotate(-8 300 76)"/><path d="m296 59 6 34m-10-23 15-2m-13 11 15-2" fill="none"/></g>
      ${bale(255,164,.77)}${pumpkin(299,164,.48,'#EEE0B5','#B5A47A')}${pumpkin(339,208,.79)}${pumpkin(273,208,.48,'#E4AE4F','#BD8231')}${pumpkin(197,208,.64)}
      `));
    // Irregular, stable planting positions: each pumpkin has a contact shadow
    // and is anchored inside the same hill layer at every viewport size.
    // Keep the scarecrow's 22–34% planting area clear. Rear pumpkins remain
    // below the hill silhouette, and the wagon has its own clear rear bed.
    // Leave the near soil lane clear: the turkey's feet must never cross a pumpkin.
    const planting=[[4,112,22],[11,120,27],[17,118,25],[20,106,21],[36,120,25],[40,129,29],[44,111,23],[49,126,27],[53,112,24],[57,130,30],[61,121,26],[65,106,22],[70,128,29],[77,119,26],[84,112,25],[90,110,25],[95,105,22]];
    footer.insertAdjacentHTML('beforeend',`<div class="patch-field" aria-hidden="true">${planting.map(([x,y,w],i)=>`<div class="patch-planted" style="left:${x}%;bottom:${(180-y)/1.8}%;width:${w}px">${svg('','-48 -82 96 94',pumpkin(0,0,1,i%5===0?'#ECD59C':i%3===0?'#EDB24E':'#DC7C2C',i%5===0?'#B59C66':'#AD652C'))}</div>`).join('')}</div>`);
    footer.insertAdjacentHTML('beforeend',svg('patch-hill-scarecrow','100 25 140 190',scarecrow)+svg('patch-hill-wagon','35 100 205 115',wagon)+svg('patch-hill-flowers','195 55 110 160',sunflower(236,208,1.3)+sunflower(276,208,1.05)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
