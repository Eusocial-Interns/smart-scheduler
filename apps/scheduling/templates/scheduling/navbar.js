// Display the navbar consistently arcoss all pages
fetch
("nav_bar.html")
.then(response => response.text())
.then(data => {
    document.getElementById("navbar").innerHTML = data;

    const hamburger = document.getElementById("hamburger");
    const navLinks = document.getElementById("nav-links");

    hamburger.addEventListener("click", () => {
        navLinks.classList.toggle("active");
    });
});