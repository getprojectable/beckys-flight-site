var e=new Intl.NumberFormat(`en-US`,{style:`currency`,currency:`USD`,maximumFractionDigits:0}),t=t=>e.format(t);function n(e){return new Date(`${e.slice(0,10)}T12:00:00Z`).toLocaleDateString(`en-US`,{weekday:`short`,month:`short`,day:`numeric`,timeZone:`UTC`})}function r(e){if(!e)return``;let[t,n]=e.slice(11,16).split(`:`).map(Number);return`${t%12||12}:${String(n).padStart(2,`0`)} ${t<12?`AM`:`PM`}`}function i(e){let t=Math.floor(e/60),n=e%60;return n?`${t}h ${n}m`:`${t}h`}function a(e,t=Date.now()){let n=Math.max(0,Math.round((t-new Date(e).getTime())/6e4));if(n<60)return n<=1?`just now`:`${n} min ago`;let r=Math.round(n/60);if(r<24)return`${r} hr ago`;let i=Math.round(r/24);return i===1?`yesterday`:`${i} days ago`}function o(e){return e.durationMin+(e.returnFlight?.durationMin??e.durationMin)}var s=20,c=`becky-flight-filters`,l=document.getElementById(`flight-data`),u=document.getElementById(`list`);document.querySelectorAll(`[data-ago]`).forEach(e=>{e.textContent=a(e.dataset.ago)}),l&&u&&d(JSON.parse(l.textContent||`{}`),u);function d({rows:e,adults:l},u){let d=e=>document.getElementById(e),p=d(`sort`),m=d(`day`),h=d(`airline`),g=d(`count`),_=d(`empty`),v=d(`more`),y=d(`clear`),b=[...document.querySelectorAll(`[data-filter]`)],x=new Intl.DateTimeFormat(`en-CA`,{timeZone:`America/Chicago`}).format(new Date);e=e.filter(e=>e.depart>=x);let S=Math.min(...e.map(e=>e.price)),C={sort:`price`,day:``,airline:``,nonstop:!1,nights:[],time:[]},w={...C};try{let e=JSON.parse(localStorage.getItem(c)||`{}`);for(let t of Object.keys(C))t in e&&Object.assign(w,{[t]:e[t]})}catch{}[...m.options].some(e=>e.value===w.day)||(w.day=``),[...h.options].some(e=>e.value===w.airline)||(w.airline=``);let T=s,E=e=>{let t=e?Number(e.slice(11,13)):-1;return t<0?``:t<12?`morning`:t<17?`afternoon`:`evening`},D=e=>(!w.day||e.depart===w.day)&&(!w.airline||e.airlines.includes(w.airline))&&(!w.nonstop||e.stops===0)&&(!w.nights.length||w.nights.includes(String(e.nights)))&&(!w.time.length||w.time.includes(E(e.departTime))),O={price:(e,t)=>e.price-t.price||e.durationMin-t.durationMin,duration:(e,t)=>o(e)-o(t)||e.price-t.price,date:(e,t)=>e.depart.localeCompare(t.depart)||e.nights-t.nights||e.price-t.price};function k(){localStorage.setItem(c,JSON.stringify(w)),p.value=w.sort,m.value=w.day,h.value=w.airline;for(let e of b){let{filter:t,value:n=``}=e.dataset,r=t===`nonstop`?w.nonstop:(w[t]??[]).includes(n);e.setAttribute(`aria-pressed`,String(r))}let t=e.filter(D).sort(O[w.sort]),n={price:`cheapest first`,duration:`shortest first`,date:`earliest first`}[w.sort];g.textContent=`${t.length} flight${t.length===1?``:`s`} · ${n}`;let r=JSON.stringify({...w,sort:`price`})!==JSON.stringify(C);y.classList.toggle(`hidden`,!r),_.classList.toggle(`hidden`,t.length>0),v.classList.toggle(`hidden`,t.length<=T),u.innerHTML=t.slice(0,T).map(N).join(``)}function A(e){return e.stops===0?`<span class="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Nonstop</span>`:`<span>${e.stops} stop${e.stops>1?`s`:``}${e.layovers.length?` · ${f(e.layovers.join(`, `))}`:``}</span>`}function j(e,t,a){let o=a.departTime&&a.arriveTime&&a.arriveTime.slice(0,10)>a.departTime.slice(0,10);return`
        <div class="mt-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">${e} · ${n(t)}</p>
          <div class="mt-1 flex items-center gap-2 text-base">
            <span class="font-semibold">${r(a.departTime)}</span>
            <span class="h-px flex-1 bg-gray-300" aria-hidden="true"></span>
            <span class="text-sm text-gray-500">${i(a.durationMin)}</span>
            <span class="h-px flex-1 bg-gray-300" aria-hidden="true"></span>
            <span class="font-semibold">${r(a.arriveTime)}${o?`<sup class="text-rose-600">+1</sup>`:``}</span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
            <span class="font-medium">${f(a.airlines.join(` + `))}</span>
            <span aria-hidden="true">·</span>
            ${A(a)}
          </div>
        </div>`}function M(e){let t=e.returnFlight;if(!t)return`
        <div class="mt-3 rounded-xl bg-gray-50 px-3 py-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Back · ${n(e.return)}</p>
          <p class="mt-0.5 text-sm text-gray-600">Return flight not checked yet. You can pick one on Google Flights, and it's included in the price.</p>
        </div>`;let r=t.destination&&e.origin&&t.destination!==e.origin?`<p class="mt-1 text-sm font-semibold text-rose-700">⚠ Lands at ${f(t.destination)}, not ${f(e.origin)}</p>`:``;return j(`Back`,e.return,t)+r}function N(e){return`
      <li class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-base font-semibold">${n(e.depart)} → ${n(e.return)}</p>
            <p class="text-sm text-gray-600">${e.nights} nights · round trip</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-extrabold leading-none tracking-tight">${t(e.price)}</p>
            <p class="mt-1 text-sm text-gray-600">${t(Math.round(e.price/l))}/person</p>
          </div>
        </div>
        ${e.price===S?`<p class="mt-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-sm font-semibold text-orange-800">Lowest price</p>`:``}
        ${j(`Out`,e.depart,e)}
        ${M(e)}
        <p class="mt-3 text-xs text-gray-500">Total for all ${l} travelers, both ways · price checked ${a(e.fetchedAt)}</p>
        <a href="${f(e.url)}" target="_blank" rel="noopener"
          class="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-orange-600 text-base font-semibold text-white active:bg-orange-700">
          Book on Google Flights ↗
        </a>
      </li>`}p.addEventListener(`change`,()=>{w.sort=p.value,T=s,k()}),m.addEventListener(`change`,()=>{w.day=m.value,T=s,k()}),h.addEventListener(`change`,()=>{w.airline=h.value,T=s,k()});for(let e of b)e.addEventListener(`click`,()=>{let{filter:t,value:n=``}=e.dataset;if(t===`nonstop`)w.nonstop=!w.nonstop;else{let e=t;w[e]=w[e].includes(n)?w[e].filter(e=>e!==n):[...w[e],n]}T=s,k()});y.addEventListener(`click`,()=>{w={...C,sort:w.sort},T=s,k()}),v.addEventListener(`click`,()=>{T+=s,k()}),k()}function f(e){return e.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`)}var p=document.getElementById(`picks`),m=[...document.querySelectorAll(`[data-dot]`)],h=6e3;if(p&&m.length>1){let e=[...p.children],t=0,n,r=t=>{p.scrollTo({left:e[t].offsetLeft,behavior:`smooth`})},i=e=>{t=e,m.forEach((t,n)=>t.setAttribute(`aria-selected`,String(n===e)))},a=new IntersectionObserver(t=>{for(let n of t)n.isIntersecting&&i(e.indexOf(n.target))},{root:p,threshold:.6});e.forEach(e=>a.observe(e));let o=()=>{window.clearInterval(n),n=void 0};m.forEach((e,t)=>e.addEventListener(`click`,()=>{o(),r(t)}));for(let e of[`pointerdown`,`touchstart`,`wheel`,`keydown`,`focusin`])p.addEventListener(e,o,{passive:!0});window.matchMedia(`(prefers-reduced-motion: reduce)`).matches||(n=window.setInterval(()=>{document.hidden||r((t+1)%e.length)},h))}