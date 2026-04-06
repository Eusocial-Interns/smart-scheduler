// displaying content for each tab
function controls(evt, announcementsTab) {
    var i, tabcontent, tablinks, messagecontent;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    messagecontent =document.getElementsByClassName("messagecontent");
    for (i = 0; i < messagecontent.length; i++) {
        messagecontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
        
    } 
    document.getElementById(announcementsTab + "Message").style.display = "block";
    document.getElementById(announcementsTab + "Tab").style.display = "block";
    evt.currentTarget.className += " active";
}
// Starting defaultOpen to the New tab 
document.getElementById("defaultOpen").click();

//
const emails = document.getElementsByClassName("emailBtn");

  for (let i = 0; i < emails.length; i++) {
    emails[i].addEventListener("click", function () {

      if (window.innerWidth <= 768) {

        // find the current visible tabcontent
        const visibleContent = document.querySelector(".tabcontent[style*='block']");

        const isOpen = visibleContent && visibleContent.style.display === "block";

        // Reset all tabcontent + buttons
        const allContents = document.getElementsByClassName("tabcontent");
        for (let j = 0; j < allContents.length; j++) {
          allContents[j].style.display = "none";
        }

        for (let j = 0; j < emails.length; j++) {
          emails[j].classList.remove("active");
        }

        // Toggle open/close
        if (!isOpen) {
          // get the parent section (New, Archive, etc.)
          const parent = this.closest(".messagecontent");
          const tabId = parent.id.replace("Message", "Tab");
          const target = document.getElementById(tabId);

          target.style.display = "block";
          this.classList.add("active");
        }
      }
    });
  }