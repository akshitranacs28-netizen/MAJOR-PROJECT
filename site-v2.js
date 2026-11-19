(() => {
  const revealItems = Array.from(document.querySelectorAll("[data-reveal], [data-text-reveal]"));
  const textItems = Array.from(document.querySelectorAll("[data-text-reveal]"));
  const prefersLessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  textItems.forEach((element) => {
    const label = element.textContent.trim().replace(/\s+/g, " ");
    if (!label) return;
    element.setAttribute("aria-label", label);
    const fragment = document.createDocumentFragment();
    label.split(/(\s+)/).forEach((part, index) => {
      if (/^\s+$/.test(part)) {
        fragment.append(document.createTextNode(part));
        return;
      }
      const word = document.createElement("span");
      word.className = "text-word";
      word.setAttribute("aria-hidden", "true");
      word.style.setProperty("--word-index", String(index));
      word.textContent = part;
      fragment.append(word);
    });
    element.replaceChildren(fragment);
  });

  document.querySelectorAll("[data-stagger]").forEach((group) => {
    Array.from(group.children).forEach((child, index) => {
      child.style.setProperty("--stagger-index", String(index));
    });
  });

  document.documentElement.classList.add("js-motion");
  window.addEventListener("load", () => {
    if (window.scrollX === 0) return;
    const scrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, window.scrollY);
    document.documentElement.style.scrollBehavior = scrollBehavior;
  }, { once: true });

  const progressBar = document.getElementById("scrollProgress");
  let lastScrollY = window.scrollY;
  document.documentElement.dataset.scrollDirection = "down";
  if (progressBar) {
    let progressFrame = 0;
    const updateProgress = () => {
      progressFrame = 0;
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY + 1) document.documentElement.dataset.scrollDirection = "down";
      else if (currentScrollY < lastScrollY - 1) document.documentElement.dataset.scrollDirection = "up";
      lastScrollY = currentScrollY;
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
      progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    };
    const requestProgressUpdate = () => {
      if (progressFrame) return;
      progressFrame = window.requestAnimationFrame(updateProgress);
    };
    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate);
    updateProgress();
  }

  if (prefersLessMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-visible", entry.isIntersecting);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

  revealItems.forEach((item) => observer.observe(item));
})();
