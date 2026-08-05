(function () {
  "use strict";

  const config = window.PORTAL_CONFIG || { links: {}, release: {} };

  function configuredHref(key, value) {
    if (!value) return "";
    return key === "contactEmail" && !/^mailto:/i.test(value)
      ? `mailto:${value}`
      : value;
  }

  document.querySelectorAll("[data-portal-link]").forEach((link) => {
    const key = link.dataset.portalLink;
    const href = configuredHref(key, config.links[key]);

    if (!href) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      link.setAttribute("aria-disabled", "true");
      link.classList.add("is-disabled");
      if (!link.textContent.includes("Coming soon")) {
        link.textContent = `${link.textContent.trim()} — Coming soon`;
      }
      return;
    }

    link.href = href;
    if (/^https?:\/\//i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });

  document.querySelectorAll("[data-release-field]").forEach((element) => {
    const value = config.release[element.dataset.releaseField];
    if (value) element.textContent = value;
  });

  const copyButton = document.querySelector("[data-copy-bibtex]");
  const bibtex = document.getElementById("bibtex-citation");

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy command was not available.");
  }

  if (copyButton && bibtex) {
    copyButton.addEventListener("click", async () => {
      const original = copyButton.textContent;
      try {
        await copyText(bibtex.textContent.trim());
        copyButton.textContent = "Copied";
      } catch (error) {
        copyButton.textContent = "Select and copy the citation";
        bibtex.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(bibtex);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      window.setTimeout(() => { copyButton.textContent = original; }, 2400);
    });
  }
})();
