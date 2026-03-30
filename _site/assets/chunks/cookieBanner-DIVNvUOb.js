import{t as c}from"./app-Bl7k7H8L.js";function d(o,n){const e=document.createElement("div");e.className="banner",e.innerHTML=`
    <div class="banner__panel">
      ${c("cookie.text")}
      <div class="dd-sep"></div>
      <button class="dd-item" id="cookie-accept">${c("cookie.accept")}</button>
      <button class="dd-item" id="cookie-decline">${c("cookie.decline")}</button>
    </div>
  `,document.body.appendChild(e),document.getElementById("cookie-accept").onclick=()=>{e.remove(),o()},document.getElementById("cookie-decline").onclick=()=>{e.remove(),n()}}export{d as createBanner};
