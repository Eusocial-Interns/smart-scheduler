const appHeader = document.querySelector(".app-header");

if (appHeader) {
    let headerHeight = appHeader.offsetHeight;
    window.addEventListener("scroll", () => {
        appHeader.classList.toggle("is-scrolled-away", window.scrollY > headerHeight);
    }, { passive: true });
}

const route = document.body.dataset.route;
const navToggle = document.getElementById("nav-toggle");
const navLinks = document.getElementById("nav-links");

document.querySelectorAll(".nav-links a").forEach((link) => {
    if (link.dataset.route === route) {
        link.classList.add("is-active");
    }
});

if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
        const isOpen = navLinks.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", String(isOpen));
    });
}
