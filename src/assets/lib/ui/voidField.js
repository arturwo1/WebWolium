export function initVoidField() {
  const canvas = document.getElementById("voidDots");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let W, H, dots = [];

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    W = canvas.width = box.width;
    H = canvas.height = box.height;
    const count = Math.floor((W * H) / 18000);
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      baseAlpha: Math.random() * 0.3 + 0.08,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.15 + 0.03,
    }));
  }

  window.addEventListener("resize", resize);
  resize();

  let t = 0;
  function draw() {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    for (const d of dots) {
      const twinkle = d.baseAlpha + Math.sin(t * d.speed * 10 + d.phase) * 0.2;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(var(--rgb-primary), ${Math.max(0, twinkle)})`.replace("var(--rgb-primary)", "128, 224, 245");
      ctx.shadowColor = "rgba(128, 224, 245, 0.35)";
      ctx.shadowBlur = 2;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}