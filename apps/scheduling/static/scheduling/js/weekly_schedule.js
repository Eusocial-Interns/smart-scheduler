let isPublished = false;
  let currentMonday = getMonday(new Date());

  // Mock data - in a real app, you'd fetch this based on currentMonday
  const scheduleData = [
    { 
      role: 'Manger', target: 1, 
      days: [
        { staff: 'Alex', current: 1 }, { staff: 'Alex', current: 1 }, 
        { staff: 'Alex', current: 1 }, { staff: 'Alex', current: 1 }, 
        { staff: 'Alex', current: 1 }, { staff: '--', current: 0 }, { staff: '--', current: 0 }
      ] 
    },
    { 
      role: 'Employee', target: 2, 
      days: [
        { staff: 'Jordan, Sam', current: 2 }, { staff: 'Jordan', current: 1 }, 
        { staff: 'Jordan, Sam', current: 2 }, { staff: 'Jordan', current: 1 }, 
        { staff: 'Jordan, Sam', current: 2 }, { staff: 'Sam', current: 1 }, { staff: '--', current: 0 }
      ] 
    }
  ];

  function getMonday(d) {
    d = new Date(d);
    let day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
  }

  function formatDateRange(monday) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const options = { month: 'short', day: 'numeric' };
    return `${monday.toLocaleDateString(undefined, options)} – ${sunday.toLocaleDateString(undefined, options)}, ${sunday.getFullYear()}`;
  }

  function render() {
    const body = document.getElementById('scheduleBody');
    const container = document.getElementById('mainContainer');
    const banner = document.getElementById('statusBanner');
    const actionBtn = document.getElementById('actionBtn');
    
    // Update Publish Status
    if (isPublished) {
      container.classList.add('published-mode');
      banner.className = "status-banner published-banner";
      document.getElementById('statusLabel').innerText = "PUBLISHED";
      document.getElementById('unpublishArea').style.display = "inline";
      actionBtn.innerText = "Export PDF"; 
    } else {
      container.classList.remove('published-mode');
      banner.className = "status-banner draft-banner";
      document.getElementById('statusLabel').innerText = "DRAFT";
      document.getElementById('unpublishArea').style.display = "none";
      actionBtn.innerText = "Publish Week";
    }

    // Update Navigation Header
    document.getElementById('dateHeading').innerText = formatDateRange(currentMonday);

    // Render Table Content
    body.innerHTML = '';
    scheduleData.forEach(rowItem => {
      const tr = document.createElement('tr');
      let html = `<td class="role-col">${rowItem.role}</td>`;
      
      rowItem.days.forEach(day => {
        const isUnder = day.current < rowItem.target;
        html += `
          <td data-coverage="${isUnder ? 'under' : 'full'}">
            <div class="staff-name">${day.staff}</div>
            <span class="badge ${isUnder ? 'badge-red' : 'badge-green'}">
              ${isUnder ? '⚠' : '✓'} ${day.current}/${rowItem.target}
            </span>
          </td>`;
      });
      tr.innerHTML = html;
      body.appendChild(tr);
    });
  }

  function changeWeek(days) {
    currentMonday.setDate(currentMonday.getDate() + days);
    render();
  }

  function togglePublish() {
    isPublished = !isPublished;
    render();
  }

  render();