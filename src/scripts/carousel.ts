const track = document.getElementById('picks');
const dots = [...document.querySelectorAll<HTMLButtonElement>('[data-dot]')];
const AUTO_MS = 6000;

if (track && dots.length > 1) {
  const slides = [...track.children] as HTMLElement[];
  let current = 0;
  let timer: number | undefined;

  const goTo = (i: number) => {
    track.scrollTo({ left: slides[i].offsetLeft, behavior: 'smooth' });
  };

  const markCurrent = (i: number) => {
    current = i;
    dots.forEach((d, j) => d.setAttribute('aria-selected', String(j === i)));
  };

  // Track which slide is mostly visible, whether it got there by swipe, dot tap or auto-advance.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) markCurrent(slides.indexOf(e.target as HTMLElement));
      }
    },
    { root: track, threshold: 0.6 },
  );
  slides.forEach((s) => observer.observe(s));

  const stopAuto = () => {
    window.clearInterval(timer);
    timer = undefined;
  };

  dots.forEach((d, i) =>
    d.addEventListener('click', () => {
      stopAuto();
      goTo(i);
    }),
  );

  // Once Becky touches the carousel, leave it where she put it.
  for (const evt of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin']) {
    track.addEventListener(evt, stopAuto, { passive: true });
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    timer = window.setInterval(() => {
      if (document.hidden) return;
      goTo((current + 1) % slides.length);
    }, AUTO_MS);
  }
}
