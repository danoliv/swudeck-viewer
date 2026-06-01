var e=`https://api.allorigins.win/raw?url=`,t=1e4,n=[`https://api.codetabs.com/v1/proxy?quest=`,`https://thingproxy.freeboard.io/fetch/`,`https://cors.bridged.cc/`,`https://corsproxy.io/?`,`https://api.allorigins.win/raw?url=`,`https://api.allorigins.win/get?url=`];function r(){if(typeof window>`u`)return!1;let e=window.location.hostname;return e===`localhost`||e===`127.0.0.1`||e===``}function i(e,t){return e?e.includes(`allorigins`)?`${e}${encodeURIComponent(t)}`:e.includes(`codetabs`)?`${e}${t}`:e.includes(`corsproxy.io`)?`${e}${encodeURIComponent(t)}`:e.includes(`bridged.cc`)||e.endsWith(`/fetch/`)||e.endsWith(`/`)?`${e}${t}`:`${e}${encodeURIComponent(t)}`:t}function a(e,t){return t?`${e}${e.includes(`?`)?`&`:`?`}_t=${Date.now()}`:e}async function o(e,t,n){if(t&&t.includes(`allorigins`)&&n.includes(`/get?url=`)){let t=await e.json();if(t?.contents)try{return JSON.parse(t.contents)}catch{return t.contents}throw Error(`AllOrigins returned an unexpected wrapper`)}if((e.headers.get(`content-type`)??``).includes(`application/json`)){let t=await e.json();if(t&&typeof t.contents==`string`)try{return JSON.parse(t.contents)}catch{return t.contents}return t}let r=await e.text();try{return JSON.parse(r)}catch{return r}}async function s(n,r=3,i=!1){let o=t=>`${e}${encodeURIComponent(t)}`,s=null;for(let e=0;e<r;e++)try{let e=new AbortController,r=setTimeout(()=>e.abort(),t),s=a(n,i),c=await fetch(o(s),{signal:e.signal,cache:`no-cache`});if(clearTimeout(r),!c.ok)throw Error(`Proxy HTTP ${c.status}`);if((c.headers.get(`content-type`)??``).includes(`application/json`)){let e=await c.json();if(e&&typeof e.contents==`string`)try{return JSON.parse(e.contents)}catch{return e.contents}return e}let l=await c.text();try{return JSON.parse(l)}catch{return l}}catch(t){s=t instanceof Error?t:Error(String(t)),console.warn(`fetchUsingExternalProxy attempt failed:`,s.message),await new Promise(t=>setTimeout(t,500*(e+1)))}throw Error(`Proxy fetch failed: ${s?.message??`unknown`}`)}async function c(e,s=3,c=!1){let l=[...r()?[null]:[],...n],u=null;for(let n of l)for(let r=0;r<s;r++)try{console.info(`fetchWithRetry: attempt ${r+1}/${s} using proxy=${n??`direct`}`);let l=new AbortController,u=setTimeout(()=>l.abort(),t),d=i(n,a(e,c)),f=await fetch(d,{signal:l.signal,cache:c?`no-cache`:`default`});if(clearTimeout(u),!f.ok)throw Error(`HTTP error from ${n??`direct`} fetch: ${f.status}`);return await o(f,n,d)}catch(e){u=e instanceof Error?e:Error(String(e));let t=u.message;if(/Failed to fetch|NetworkError|CORS|Access-Control-Allow-Origin/.test(t)?console.warn(`fetchWithRetry failed (proxy=${n??`direct`}): likely CORS/network`,t):console.warn(`fetchWithRetry failed (proxy=${n??`direct`}):`,t),r===s-1)break;await new Promise(e=>setTimeout(e,500*(r+1)))}throw Error(`All attempts failed: ${u?.message??`unknown`}`)}function l(e){if(!e)return null;try{let t=new URL(e).pathname.split(`/`).filter(Boolean);return t[t.length-1]||null}catch{return e.split(`/`).pop()||null}}function u(e,t){let n=new URL(window.location.toString());t==null?n.searchParams.delete(e):n.searchParams.set(e,t),window.history.pushState({},``,n.toString())}function d(e){let t=new URL(window.location.toString());Object.keys(e).forEach(n=>{let r=e[n];r==null?t.searchParams.delete(n):t.searchParams.set(n,r)}),window.history.pushState({},``,t.toString())}var f=[`SOR`,`SHD`,`TWI`,`JTL`,`LOF`,`IBH`,`SEC`,`LAW`,`TS26`];function p(){return[...f]}var m={},h={};async function g(e){return m[e]?m[e]:(h[e]||(h[e]=(async()=>{try{console.log(`Loading set ${e}...`);let t=await fetch(`data/${e.toLowerCase()}.json`);if(!t.ok)throw Error(`Failed to load ${e} data: ${t.status}`);let n=(await t.json()).data;if(!Array.isArray(n))throw Error(`Invalid data format for set ${e}: expected array in data property`);console.log(`Successfully loaded set ${e} with ${n.length} cards`);let r={};for(let e of n)e.Number!==void 0&&(r[parseInt(String(e.Number),10)]=e);return m[e]=r,r}catch(t){throw console.error(`Error loading set ${e}:`,t),delete m[e],t}finally{delete h[e]}})()),h[e])}async function _(){try{await Promise.all(p().map(e=>g(e))),console.log(`All sets preloaded successfully`)}catch(e){console.error(`Error preloading sets:`,e)}}async function v(e){let[t,n]=e.split(`_`),r=parseInt(n,10);try{let n=await g(t);if(!n)throw Error(`Set ${t} not found`);let i=n[r];return i?(i.id=e,i.Type||=`Unknown`,i):(console.warn(`Card ${e} not found in set ${t}`),{id:e,Name:e,Set:t,Number:r,Type:`Unknown`})}catch(n){return console.error(`Error fetching card ${e}:`,n),{id:e,Name:e,Set:t,Number:r,Type:`Unknown`}}}function y(){for(let e of Object.keys(m))delete m[e];for(let e of Object.keys(h))delete h[e]}function b(e,t={},n=1,r=0,i=``){let a=t.Aspects??[],o=[];t.Cost!==void 0&&o.push([`Cost`,t.Cost]),t.Power!==void 0&&o.push([`Power`,t.Power]),t.HP!==void 0&&o.push([`HP`,t.HP]);let s=e.replace(`_`,` `),c=t.DoubleSided===!0,l=``;return n>0&&r>0?l=`Deck: ${n} | Side: ${r}`:n>0?l=`Deck: ${n}`:r>0&&(l=`Side: ${r}`),`
        <div class="card ${i}" 
            onclick="this.classList.toggle('selected')" 
            data-card-id="${s}">
            <div class="card-id">
                <span>${s}</span>
                ${c?`<button class="flip-button" onclick="event.stopPropagation(); this.closest('.card').classList.toggle('flipped')">Flip Card</button>`:``}
            </div>
            ${l?`<div class="card-counts" style="background: #f0f0f0; padding: 4px; margin: 5px 0; border-radius: 3px; font-size: 0.9em; font-weight: bold; text-align: center;">${l}</div>`:``}
            <div class="card-name">${t.Name??e}</div>
            ${a.length?`
                <div class="aspects">
                    ${a.map(e=>`
                        <span class="aspect ${e}">${e}</span>
                    `).join(``)}
                </div>
            `:``}
            <div class="card-images">
                <div class="card-images-inner">
                    <div class="card-front">
                        ${t.FrontArt?`<img src="${t.FrontArt}" alt="${t.Name??e} (Front)">`:`<div class="card-placeholder">${e}</div>`}
                    </div>
                    ${c&&t.BackArt?`
                        <div class="card-back">
                            <img src="${t.BackArt}" alt="${t.Name??e} (Back)">
                        </div>
                    `:``}
                </div>
            </div>
            <div class="card-content">
                ${o.length?`
                    <div class="card-stats">
                        ${o.map(([e,t])=>`
                            <span class="stat" data-type="${e}">${e}: <span class="stat-value">${t}</span></span>
                        `).join(``)}
                    </div>
                `:``}
            </div>
        </div>
    `}function x(e,t={},n=0,r=0,i=``,a=`Deck 1`,o=`Deck 2`,s=0,c=0){let l=t.Aspects??[],u=[];t.Cost!==void 0&&u.push([`Cost`,t.Cost]),t.Power!==void 0&&u.push([`Power`,t.Power]),t.HP!==void 0&&u.push([`HP`,t.HP]);let d=e.replace(`_`,` `),f=t.DoubleSided===!0,p=n+s,m=r+c,h=``;if(p>0&&m>0){let e=`${a}: ${n}`;s>0&&(e+=` (${s} side)`);let t=`${o}: ${r}`;c>0&&(t+=` (${c} side)`),h=`${e} | ${t}`}else p>0?(h=`${a}: ${n}`,s>0&&(h+=` (${s} side)`)):m>0&&(h=`${o}: ${r}`,c>0&&(h+=` (${c} side)`));return`
        <div class="card ${i}">
            <div class="card-id">
                <span>${d}</span>
                ${f?`<button class="flip-button" onclick="event.stopPropagation(); this.closest('.card').classList.toggle('flipped')">Flip Card</button>`:``}
            </div>
            ${h?`<div class="card-counts" style="background: #f0f0f0; padding: 4px; margin: 5px 0; border-radius: 3px; font-size: 0.9em; font-weight: bold; text-align: center;">${h}</div>`:``}
            <div class="card-name">${t.Name??e}</div>
            ${l.length?`
                <div class="aspects">
                    ${l.map(e=>`
                        <span class="aspect ${e}">${e}</span>
                    `).join(``)}
                </div>
            `:``}
            <div class="card-images">
                <div class="card-images-inner">
                    <div class="card-front">
                        ${t.FrontArt?`<img src="${t.FrontArt}" alt="${t.Name??e} (Front)">`:`<div class="card-placeholder">${e}</div>`}
                    </div>
                    ${f&&t.BackArt?`
                        <div class="card-back">
                            <img src="${t.BackArt}" alt="${t.Name??e} (Back)">
                        </div>
                    `:``}
                </div>
            </div>
            <div class="card-content">
                ${u.length?`
                    <div class="card-stats">
                        ${u.map(([e,t])=>`
                            <span class="stat" data-type="${e}">${e}: <span class="stat-value">${t}</span></span>
                        `).join(``)}
                    </div>
                `:``}
            </div>
        </div>
    `}typeof window<`u`&&_();export{p as a,d as c,v as i,s as l,x as n,l as o,y as r,u as s,b as t,c as u};