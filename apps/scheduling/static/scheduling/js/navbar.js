const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('active');
});
document.querySelectorAll('nav a').forEach (link => {
    if (link.href === window.location.href) {
    link.classList.add('active');
  }  
});