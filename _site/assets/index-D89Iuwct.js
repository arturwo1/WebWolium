import"./chunks/app-Bl7k7H8L.js";const c=document.getElementById("grid");document.getElementById("sprite");const s=document.getElementById("status"),a=["AI","balance","bank_balance","calendar","clock","dnd","economy","guild","idle","messages","moderation","offline","online","robot","streaming","upgrade","voice","Wolium_gif","Wolium_ico","x2buyamount","x2workamount"];function i(n){c.innerHTML="",n.forEach(e=>{const t=document.createElement("div");t.className="card",t.innerHTML=`
        <div class="form-row">
          <svg class="icon2"
              viewBox="0 0 24 24"
              preserveAspectRatio="xMidYMid meet"
              aria-label="${e}">
            <use href="#${e}"></use>
          </svg>
          <button class="btn" data-copy="${e}">Copy</button>
        </div>
        <div class="name">${e}</div>
      `,c.appendChild(t)}),c.querySelectorAll("[data-copy]").forEach(e=>{e.addEventListener("click",async()=>{const r=`<svg class="icon2"><use href="#${e.getAttribute("data-copy")}"></use></svg>`;try{await navigator.clipboard.writeText(r),e.textContent="Copied",setTimeout(()=>e.textContent="Copy",700)}catch{e.textContent="No clipboard",setTimeout(()=>e.textContent="Copy",900)}})})}function l(){try{const n=document.querySelector("svg[style*='display']")||document.querySelector("body > svg");if(!n)throw new Error("Sprite not found");const e=[...n.querySelectorAll("symbol[id]")].map(t=>t.id).sort();s.textContent=`Loaded ${e.length} icons`,i(e.length?e:a)}catch{s.textContent="Showing fallback list",i(a)}}const d=document.getElementById("size"),u=document.getElementById("sizeVal");d.addEventListener("input",()=>{document.documentElement.style.setProperty("--sz",d.value+"px"),u.textContent=d.value+"px"});let o=0;document.getElementById("toggleBg").addEventListener("click",()=>{o=(o+1)%3,o===0&&(document.body.style.background="rgb(var(--rgb-bg))"),o===1&&(document.body.style.background="#0b0f12"),o===2&&(document.body.style.background="#ffffff")});l();
