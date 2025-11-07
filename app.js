// Simple Planner: Inbox + Week Calendar (vanilla JS, localStorage)
(function(){
  'use strict';

  // ========================================
  // CONSTANTS
  // ========================================
  const STORAGE_KEY = 'planner_state_v1';
  const RECURRENCE_CAP_DAYS = 30; // Max days into future for recurring events
  const RESIZE_SNAP_MINUTES = 15; // Snap resize to 15-minute increments
  const MIN_EVENT_DURATION = 15; // Minimum event duration in minutes
  const INITIAL_SCROLL_TIME = 6 * 60 + 30; // 6:30 AM in minutes
  const NOW_LINE_UPDATE_INTERVAL = 60000; // Update now-line every minute
  const MAX_EVENT_DURATION = 480; // Cap event duration at 8 hours

  // ========================================
  // STATE & INITIALIZATION
  // ========================================
  const state = loadState();
  // Initialize viewStart based on view mode
  state.viewStart = state.viewStart
    ? new Date(state.viewStart)
    : (state.viewMode === '4d' ? startOfDay(new Date()) : startOfWeek(new Date()));

  // ========================================
  // DOM ELEMENTS
  // ========================================
  // Toolbar
  const weekLabelEl = document.getElementById('weekLabel');
  const prevWeekBtn = document.getElementById('prevWeek');
  const todayBtn = document.getElementById('todayBtn');
  const nextWeekBtn = document.getElementById('nextWeek');
  const viewModeSelect = document.getElementById('viewMode');
  const densitySelect = document.getElementById('density');
  const searchInput = document.getElementById('searchInput');

  // Inbox
  const inboxListEl = document.getElementById('inboxList');
  const inboxDropZoneEl = document.getElementById('inboxDropZone');
  const addTaskForm = document.getElementById('addTaskForm');
  const taskTitleInput = document.getElementById('taskTitle');
  const taskDurationInput = document.getElementById('taskDuration');

  // Calendar
  const calendarHeaderEl = document.getElementById('calendarHeader');
  const timeGutterEl = document.getElementById('timeGutter');
  const daysContainerEl = document.getElementById('daysContainer');
  const calendarBodyEl = document.getElementById('calendarBody');

  // Event dialog
  const eventDialog = document.getElementById('eventDialog');
  const eventTitleInput = document.getElementById('eventTitleInput');
  const eventDurationInput = document.getElementById('eventDurationInput');
  const eventRepeatSelect = document.getElementById('eventRepeatSelect');
  const repeatDaysEl = document.getElementById('repeatDays');
  const saveBtn = document.getElementById('saveBtn');
  const unscheduleBtn = document.getElementById('unscheduleBtn');
  const deleteBtn = document.getElementById('deleteBtn');

  let dialogTaskId = null; // ID of task currently being edited in dialog

  // ========================================
  // INITIALIZATION
  // ========================================
  attachToolbarHandlers();
  attachViewModeHandler();
  attachDensityHandler();
  attachSearchHandler();
  attachInboxDropHandlers();
  attachFormHandlers();
  attachDialogRepeatHandlers();
  applyDensity();
  renderAll();
  ensureInitialScroll('init');
  
  // Re-fit calendar in compact mode on window resize
  window.addEventListener('resize', ()=>{
    if(state.density === 'compact'){
      applyDensity();
      renderEvents();
    }
  });

  // ========================================
  // RENDERING FUNCTIONS
  // ========================================
  
  /**
   * Re-renders all UI components
   */
  function renderAll(){
    renderWeekLabel();
    renderCalendarHeader();
    renderTimeGutter();
    renderDaysGrid();
    applyDensity(); // Re-apply after layout changes
    renderInbox();
    renderEvents();
  }

  // ========================================
  // STATE PERSISTENCE
  // ========================================
  
  /**
   * Load planner state from localStorage
   * @returns {Object} State object with tasks, view settings, etc.
   */
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw){
        // First time: seed with sample tasks
        return { 
          viewStart: null, 
          viewMode: '7d', 
          density: 'cozy', 
          filterText: '', 
          tasks: sampleTasks() 
        };
      }
      const parsed = JSON.parse(raw);
      // Ensure required properties exist
      if(!parsed.tasks) parsed.tasks = [];
      if(!parsed.viewMode) parsed.viewMode = '7d';
      if(!parsed.density) parsed.density = 'cozy';
      if(typeof parsed.filterText !== 'string') parsed.filterText = '';
      return parsed;
    }catch(e){
      console.warn('Failed to load state, starting fresh', e);
      return { 
        viewStart: null, 
        viewMode: '7d', 
        density: 'cozy', 
        filterText: '', 
        tasks: sampleTasks() 
      };
    }
  }

  /**
   * Save current state to localStorage
   */
  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      viewStart: state.viewStart.toISOString(),
      viewMode: state.viewMode,
      density: state.density,
      filterText: state.filterText,
      tasks: state.tasks
    }));
  }

  /**
   * Generate sample tasks for first-time users
   * @returns {Array} Array of sample task objects
   */
  function sampleTasks(){
    return [
      { id: uid(), title: 'Read 20 pages', duration: 45, scheduledStart: null },
      { id: uid(), title: 'Workout session', duration: 60, scheduledStart: null },
      { id: uid(), title: 'Write blog paragraph', duration: 30, scheduledStart: null },
    ];
  }

  // ========================================
  // TOOLBAR HANDLERS
  // ========================================
  
  function attachToolbarHandlers(){
    prevWeekBtn.addEventListener('click', ()=>{
      state.viewStart = addDays(state.viewStart, -getDaysCount());
      renderAll();
      saveState();
    });
    
    nextWeekBtn.addEventListener('click', ()=>{
      state.viewStart = addDays(state.viewStart, getDaysCount());
      renderAll();
      saveState();
    });
    
    todayBtn.addEventListener('click', ()=>{
      state.viewStart = state.viewMode==='4d' 
        ? startOfDay(new Date()) 
        : startOfWeek(new Date());
      renderAll();
      saveState();
    });
  }
  
  function attachViewModeHandler(){
    viewModeSelect.value = state.viewMode || '7d';
    viewModeSelect.addEventListener('change', ()=>{
      state.viewMode = viewModeSelect.value;
      // Reset view start: today for 4-day view, Monday for week view
      state.viewStart = state.viewMode==='4d' 
        ? startOfDay(new Date()) 
        : startOfWeek(new Date());
      renderAll();
      saveState();
      ensureInitialScroll('view-change');
    });
  }
  
  function attachDensityHandler(){
    densitySelect.value = state.density || 'cozy';
    densitySelect.addEventListener('change', ()=>{
      state.density = densitySelect.value;
      applyDensity();
      renderEvents();
      saveState();
      ensureInitialScroll('density-change');
    });
  }
  
  /**
   * Apply density setting to calendar (adjust slot heights)
   */
  function applyDensity(){
    let px;
    if(state.density === 'compact'){
      // Fit 48 half-hour slots exactly within visible calendar body
      const h = calendarBodyEl ? calendarBodyEl.clientHeight : 0;
      px = Math.max(14, Math.floor(h / 48));
    }else{
      px = getSlot30Px();
    }
    if(px){
      document.documentElement.style.setProperty('--slot-30', px+'px');
    }
  }
  
  function renderWeekLabel(){
    const start = state.viewStart;
    const end = addDays(start, getDaysCount()-1);
    weekLabelEl.textContent = `${formatDate(start, {month:'short', day:'numeric'})} – ${formatDate(end, {month:'short', day:'numeric', year:'numeric'})}`;
  }

  // ========================================
  // INBOX (UNSCHEDULED TASKS)
  // ========================================
  
  function attachFormHandlers(){
    addTaskForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const title = taskTitleInput.value.trim();
      let duration = parseInt(taskDurationInput.value, 10) || 60;
      if(!title) return;
      if(duration > MAX_EVENT_DURATION) duration = MAX_EVENT_DURATION;
      
      state.tasks.push({ 
        id: uid(), 
        title, 
        duration, 
        scheduledStart: null 
      });
      taskTitleInput.value = '';
      renderInbox();
      saveState();
    });
  }
  
  /**
   * Render unscheduled tasks in the Inbox
   */
  function renderInbox(){
    inboxListEl.innerHTML = '';
    const inbox = state.tasks.filter(t => !t.scheduledStart && matchesFilter(t));
    
    if(inbox.length === 0){
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.padding = '12px';
      empty.textContent = 'No tasks yet. Add some and drag to schedule.';
      inboxListEl.appendChild(empty);
      return;
    }
    
    for(const t of inbox){
      const li = document.createElement('li');
      li.className = 'task';
      li.draggable = true;
      li.dataset.taskId = t.id;
      li.addEventListener('dragstart', (ev) => onDragStartTask(ev, t.id, 'inbox'));

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';
      left.style.gap = '4px';

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = t.title;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = durationLabel(t.duration);
      
      // Add recurring indicator for tasks with recurrence configured
      if(t.recurrence){
        const recurringBadge = document.createElement('span');
        recurringBadge.className = 'recurring-badge';
        recurringBadge.textContent = '↻ Recurring';
        recurringBadge.title = 'This task repeats';
        meta.appendChild(document.createTextNode(' • '));
        meta.appendChild(recurringBadge);
      }

      left.appendChild(title); 
      left.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'actions';

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.type = 'button';
      delBtn.innerHTML = trashSvg('Delete task');
      delBtn.addEventListener('click', ()=>{
        state.tasks = state.tasks.filter(x => x.id !== t.id);
        renderInbox();
        renderEvents();
        saveState();
      });

      actions.appendChild(delBtn);
      li.appendChild(left); 
      li.appendChild(actions);
      inboxListEl.appendChild(li);
    }
  }
  
  /**
   * Handle dropping tasks back into Inbox to unschedule them
   */
  function attachInboxDropHandlers(){
    ['dragover','dragenter'].forEach(type => {
      inboxDropZoneEl.addEventListener(type, (e) => {
        if(!hasPlannerData(e)) return;
        e.preventDefault(); 
        inboxDropZoneEl.classList.add('dragover');
      });
    });
    
    ['dragleave','drop'].forEach(type => {
      inboxDropZoneEl.addEventListener(type, () => {
        inboxDropZoneEl.classList.remove('dragover');
      });
    });
    
    inboxDropZoneEl.addEventListener('drop', (e) => {
      const data = readPlannerData(e);
      if(!data) return;
      if(data.type === 'task'){
        const task = findTask(data.id);
        if(task){
          task.scheduledStart = null;
          renderInbox();
          renderEvents();
          saveState();
        }
      }
    });
  }

  /**
   * Start dragging a task (from inbox or calendar)
   */
  function onDragStartTask(ev, taskId, source){
    const payload = { type:'task', id: taskId, source };
    ev.dataTransfer.setData('application/json', JSON.stringify(payload));
    ev.dataTransfer.effectAllowed = 'move';
  }

  // ========================================
  // CALENDAR GRID RENDERING
  // ========================================
  
  /**
   * Render calendar header with day columns
   */
  function renderCalendarHeader(){
    calendarHeaderEl.innerHTML = '';
    const daysCount = getDaysCount();
    calendarHeaderEl.style.gridTemplateColumns = `60px repeat(${daysCount}, 1fr)`;
    
    // Corner cell
    const corner = document.createElement('div');
    corner.className = 'cell';
    calendarHeaderEl.appendChild(corner);

    // Day columns
    for(let i = 0; i < daysCount; i++){
      const d = addDays(state.viewStart, i);
      const cell = document.createElement('div');
      cell.className = 'cell';
      const dow = new Intl.DateTimeFormat(undefined, {weekday:'short'}).format(d);
      const isToday = isSameDate(d, new Date());
      cell.innerHTML = `<div class="dow">${dow}${isToday ? ' • Today' : ''}</div><div class="date">${formatDate(d, {month:'short', day:'numeric'})}</div>`;
      calendarHeaderEl.appendChild(cell);
    }
  }
  
  /**
   * Render time labels (00:00 - 23:00) in left gutter
   */
  function renderTimeGutter(){
    timeGutterEl.innerHTML = '';
    for(let h = 0; h < 24; h++){
      const el = document.createElement('div');
      el.className = 'hour';
      el.textContent = `${pad(h)}:00`;
      timeGutterEl.appendChild(el);
    }
  }
  
  /**
   * Render day columns with time slots (48 half-hour slots per day)
   */
  function renderDaysGrid(){
    daysContainerEl.innerHTML = '';
    const daysCount = getDaysCount();
    daysContainerEl.style.gridTemplateColumns = `repeat(${daysCount}, 1fr)`;
    
    for(let dayIdx = 0; dayIdx < daysCount; dayIdx++){
      const dayCol = document.createElement('div');
      dayCol.className = 'day-column';
      dayCol.dataset.dayIndex = String(dayIdx);

      // 48 half-hour slots per day
      for(let i = 0; i < 48; i++){
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.minutes = String(i * 30);
        attachSlotDnD(slot);
        dayCol.appendChild(slot);
      }
      daysContainerEl.appendChild(dayCol);
    }
  }
  
  /**
   * Attach drag-and-drop and double-click handlers to a time slot
   */
  function attachSlotDnD(slot){
    // Drag-over: show drop target highlight
    slot.addEventListener('dragover', (e) => {
      if(!hasPlannerData(e)) return;
      e.preventDefault();
      slot.classList.add('drop-target');
    });
    
    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drop-target');
    });
    
    // Drop: schedule task at this time
    slot.addEventListener('drop', (e) => {
      slot.classList.remove('drop-target');
      const data = readPlannerData(e);
      if(!data || data.type !== 'task') return;
      const task = findTask(data.id);
      if(!task) return;

      const dayIdx = parseInt(slot.parentElement.dataset.dayIndex, 10);
      const minutes = parseInt(slot.dataset.minutes, 10);
      const dayDate = addDays(startOfDay(state.viewStart), dayIdx);
      const scheduled = new Date(dayDate);
      scheduled.setHours(0, minutes, 0, 0);

      // Prevent overlaps
      const newStartISO = scheduled.toISOString();
      const dur = task.duration || 60;
      if(hasOverlap(newStartISO, dur, task.id)){
        alert('That time overlaps another event.');
        return;
      }
      
      task.scheduledStart = newStartISO;
      if(!task.duration) task.duration = 60; // Default duration

      renderInbox();
      renderEvents();
      saveState();
    });
    
    // Double-click: quick-create event at this time
    slot.addEventListener('dblclick', () => {
      const title = prompt('New event title');
      if(!title) return;
      
      const dayIdx = parseInt(slot.parentElement.dataset.dayIndex, 10);
      const minutes = parseInt(slot.dataset.minutes, 10);
      const dayDate = addDays(startOfDay(state.viewStart), dayIdx);
      const scheduled = new Date(dayDate);
      scheduled.setHours(0, minutes, 0, 0);
      let duration = parseInt(taskDurationInput.value, 10) || 60;
      if(duration > MAX_EVENT_DURATION) duration = MAX_EVENT_DURATION;
      
      if(hasOverlap(scheduled.toISOString(), duration, null)){
        alert('That time overlaps another event.');
        return;
      }
      
      state.tasks.push({ 
        id: uid(), 
        title: title.trim(), 
        duration, 
        scheduledStart: scheduled.toISOString() 
      });
      saveState();
      renderInbox();
      renderEvents();
    });
  }

  // ========================================
  // EVENT RENDERING
  // ========================================
  
  /**
   * Render all scheduled events and recurring occurrences on the calendar
   */
  function renderEvents(){
    // Clear existing event blocks
    const dayCols = daysContainerEl.querySelectorAll('.day-column');
    dayCols.forEach(col => {
      col.querySelectorAll('.event').forEach(n => n.remove());
    });

    renderNowIndicator();

    const start = startOfDay(state.viewStart);
    const end = addDays(start, getDaysCount());
    const now = new Date();
    const capFuture = addDays(now, RECURRENCE_CAP_DAYS);

    // Gather all visible events (scheduled and recurring) for color assignment
    let visibleEvents = [];
    // Primary scheduled events
    const scheduled = state.tasks.filter(t => t.scheduledStart && matchesFilter(t));
    for(const t of scheduled){
      const startDt = new Date(t.scheduledStart);
      if(!(startDt >= start && startDt < end)) continue;
      visibleEvents.push({task: t, startDt, isRecurring: false, occurrenceKey: null});
    }
    // Recurring occurrences
    for(const t of state.tasks){
      if(!t.recurrence || !t.scheduledStart) continue;
      const occs = generateOccurrences(t, start, end, capFuture);
      for(const occ of occs){
        const startDt = occ.start;
        if(!(startDt >= start && startDt < end)) continue;
        visibleEvents.push({task: occ.parent, startDt, isRecurring: true, occurrenceKey: occ.key});
      }
    }

    // Assign a unique accent color to each visible event (slight hue shift)
    const baseColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    // Try to extract base hue from HSL or fallback to blue
    let baseHue = 210; // fallback
    let baseS = 85, baseL = 65;
    const hslMatch = baseColor.match(/hsl\((\d+)[^\d]+(\d+)%[^\d]+(\d+)%/);
    if(hslMatch) {
      baseHue = parseInt(hslMatch[1],10);
      baseS = parseInt(hslMatch[2],10);
      baseL = parseInt(hslMatch[3],10);
    }
    // If not HSL, try to convert hex to HSL
    else if(baseColor.startsWith('#')) {
      const hex = baseColor.replace('#','');
      let r = 0, g = 0, b = 0;
      if(hex.length === 6) {
        r = parseInt(hex.substring(0,2),16);
        g = parseInt(hex.substring(2,4),16);
        b = parseInt(hex.substring(4,6),16);
      } else if(hex.length === 3) {
        r = parseInt(hex[0]+hex[0],16);
        g = parseInt(hex[1]+hex[1],16);
        b = parseInt(hex[2]+hex[2],16);
      }
      // Convert RGB to HSL
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r,g,b), min = Math.min(r,g,b);
      let h, s, l = (max+min)/2;
      if(max === min){ h = s = 0; }
      else {
        const d = max-min;
        s = l > 0.5 ? d/(2-max-min) : d/(max+min);
        switch(max){
          case r: h = (g-b)/d + (g<b?6:0); break;
          case g: h = (b-r)/d + 2; break;
          case b: h = (r-g)/d + 4; break;
        }
        h = Math.round(h*60);
        s = Math.round(s*100);
        l = Math.round(l*100);
      }
      baseHue = h; baseS = s; baseL = l;
    }

    // Assign colors with a larger hue offset for each event (spread around the color wheel)
    const total = visibleEvents.length;
    visibleEvents.forEach((ev, idx) => {
      // Use a full 240-degree spread for up to 8 events, then wrap
      const spread = 240;
      const hueOffset = total > 1 ? (idx * spread / (total)) : 0;
      const hue = (baseHue + hueOffset) % 360;
      const color = `hsl(${hue}, ${baseS}%, ${baseL}%)`;
      renderEventBlock(ev.task, ev.startDt, ev.isRecurring, ev.occurrenceKey, color);
    });
  }
  
  /**
   * Render a single event block on the calendar
   * @param {Object} task - The task object
   * @param {Date} startDt - Start datetime for this occurrence
   * @param {boolean} isRecurring - Whether this is a recurring occurrence
   * @param {string} occurrenceKey - Unique key for recurring occurrence
   */
  function renderEventBlock(task, startDt, isRecurring = false, occurrenceKey = null, overrideColor = null){
    const start = startOfDay(state.viewStart);
    const dayIdx = diffDays(start, startOfDay(startDt));
    const minutes = startDt.getHours() * 60 + startDt.getMinutes();

    const col = daysContainerEl.querySelector(`.day-column[data-day-index="${dayIdx}"]`);
    if(!col) return;

    const block = document.createElement('div');
    block.className = isRecurring ? 'event recurring' : 'event';
    block.draggable = !isRecurring; // Recurring occurrences are not draggable
    block.dataset.taskId = task.id;
    if(occurrenceKey) block.dataset.occurrence = occurrenceKey;
    
  const color = overrideColor || colorFromId(task.id);
  block.style.background = `linear-gradient(180deg, ${color}cc, ${color})`;
  block.style.borderColor = color;

    const pxPerMinute = getSlot30Px() / 30;
    block.style.top = `${minutes * pxPerMinute}px`;
    const height = Math.max(22, (task.duration || 60) * pxPerMinute);
    block.style.height = `${height}px`;

    // Build event content with recurring indicator
    let timeContent = `${formatHM(startDt)} · ${durationLabel(task.duration)}`;
    if(task.recurrence && !isRecurring){
      // Show recurring indicator on the primary event (not on individual occurrences)
      timeContent += ' <span class="recurring-badge-inline">↻</span>';
    }
    
    block.innerHTML = `<div class="event-title">${escapeHtml(task.title)}</div><div class="event-time">${timeContent}</div>`;
    
    // Add resize handle for primary events only
    if(!isRecurring){
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.draggable = false;
      handle.addEventListener('dragstart', (e) => e.preventDefault());
      handle.addEventListener('mousedown', (e) => startResize(e, task.id));
      block.appendChild(handle);
    }

    // Compact layout for short events
    if(height < 44 || (task.duration || 60) <= 45){
      block.classList.add('compact');
    }

    // Interactions
    if(!isRecurring){
      block.addEventListener('dragstart', (e) => onDragStartTask(e, task.id, 'calendar'));
    }
    block.addEventListener('click', () => openEventDialog(task.id));

    col.appendChild(block);
  }

  /**
   * Handle resizing an event by dragging its bottom edge
   * @param {MouseEvent} e - The mousedown event
   * @param {string} taskId - ID of the task being resized
   */
  function startResize(e, taskId){
    e.stopPropagation();
    e.preventDefault();
    
    const task = findTask(taskId); 
    if(!task) return;
    
    const startY = e.clientY;
    const original = task.duration || 60;
    const pxPerMinute = getSlot30Px() / 30;
    
    function onMove(ev){
      const delta = ev.clientY - startY;
      const deltaMins = Math.round(delta / pxPerMinute / RESIZE_SNAP_MINUTES) * RESIZE_SNAP_MINUTES;
      let preview = Math.max(MIN_EVENT_DURATION, original + deltaMins);
      if(preview > MAX_EVENT_DURATION) preview = MAX_EVENT_DURATION;
      const block = daysContainerEl.querySelector(`.event[data-task-id="${taskId}"]`);
      if(block){ 
        block.style.height = `${Math.max(22, preview * pxPerMinute)}px`; 
      }
    }
    
    function onUp(ev){
      const delta = ev.clientY - startY;
      const deltaMins = Math.round(delta / pxPerMinute / RESIZE_SNAP_MINUTES) * RESIZE_SNAP_MINUTES;
      let next = Math.max(MIN_EVENT_DURATION, original + deltaMins);
      if(next > MAX_EVENT_DURATION) next = MAX_EVENT_DURATION;
      
      // Validate new duration doesn't cause overlap
      if(task.scheduledStart && hasOverlap(task.scheduledStart, next, task.id)){
        alert('Resize would overlap another event.');
      }else{
        task.duration = next;
        saveState();
      }
      renderEvents();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  /**
   * Render the "now" indicator line showing current time
   */
  function renderNowIndicator(){
    // Remove existing now line
    daysContainerEl.querySelectorAll('.now-line').forEach(n => n.remove());

    const now = new Date();
    const start = startOfDay(state.viewStart);
    const end = addDays(start, getDaysCount());

    if(!(now >= start && now < end)) return; // Not in visible range

    const dayIdx = diffDays(start, startOfDay(now));
    const minutes = now.getHours() * 60 + now.getMinutes();
    const pxPerMinute = getSlot30Px() / 30;
    const y = minutes * pxPerMinute;

    const line = document.createElement('div');
    line.className = 'now-line';
    line.style.position = 'absolute';
    line.style.left = '0';
    line.style.right = '0';
    line.style.top = y + 'px';
  line.style.height = '2.5px';
  line.style.background = 'var(--accent)';
  line.style.boxShadow = '0 0 4px 0.5px var(--accent), 0 1px 4px 0px #0003';
  line.style.borderRadius = '2px';
    line.style.pointerEvents = 'none';
    line.style.zIndex = '10';

    // Add time label
    const label = document.createElement('div');
    label.textContent = formatHM(now);
    label.style.position = 'absolute';
  label.style.right = '6px';
  label.style.top = '-12px';
  label.style.fontSize = '10px';
  label.style.fontWeight = 'normal';
  label.style.padding = '2px 6px';
  label.style.background = 'rgba(0,0,0,0.35)';
  label.style.borderRadius = '4px';
  label.style.color = 'var(--text)';
  label.style.boxShadow = '0 1px 2px 0px #0002';
  label.style.letterSpacing = '0px';
  label.style.textShadow = 'none';
  label.style.border = 'none';
    line.appendChild(label);

    const col = daysContainerEl.querySelector(`.day-column[data-day-index="${dayIdx}"]`);
    if(col){
      col.appendChild(line);
    }
  }

  // Update now-line periodically
  setInterval(() => {
    renderNowIndicator();
  }, NOW_LINE_UPDATE_INTERVAL);
  /**
   * Scroll calendar to initial position (6:30 AM for cozy/relaxed, top for compact)
   * @param {string} reason - Why we're scrolling (init, view-change, density-change)
   */
  function ensureInitialScroll(reason){
    if(!calendarBodyEl) return;
    
    const container = calendarBodyEl;
    const pxPerMinute = getSlot30Px() / 30;
    
    if(state.density === 'compact'){
      // Whole day fits; stay at top
      container.scrollTop = 0;
      return;
    }
    
    // For cozy/relaxed, scroll to morning (6:30 AM)
    const targetY = INITIAL_SCROLL_TIME * pxPerMinute;
    
    // Only auto-scroll if user hasn't scrolled yet or explicit reason
    if(reason === 'init' || reason === 'density-change' || reason === 'view-change' || container.scrollTop < 4){
      container.scrollTop = targetY;
    }
  }

  // ========================================
  // EVENT DIALOG
  // ========================================
  
  /**
   * Open the event edit dialog for a task
   * @param {string} taskId - ID of task to edit
   */
  function openEventDialog(taskId){
    const t = findTask(taskId);
    if(!t) return;
    
    dialogTaskId = t.id;
    eventTitleInput.value = t.title;
    eventDurationInput.value = String(t.duration || 60);
    
    // Populate recurrence UI
    const rec = t.recurrence || null;
    if(eventRepeatSelect && repeatDaysEl){
      if(rec && Array.isArray(rec.days) && rec.days.length > 0){
        // Support daily, weekly, and custom types
        if(rec.type === 'daily'){
          eventRepeatSelect.value = 'daily';
          showRepeatDays(false);
        }else if(rec.type === 'weekly'){
          // Weekly repeats on the same weekday; no need to ask days
          eventRepeatSelect.value = 'weekly';
          showRepeatDays(false);
        }else{
          eventRepeatSelect.value = 'custom';
          showRepeatDays(true);
          repeatDaysEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.checked = (rec.days.indexOf(parseInt(cb.value, 10)) !== -1);
          });
        }
      }else{
        eventRepeatSelect.value = 'none';
        showRepeatDays(false);
        repeatDaysEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
      }
    }
    
    if(typeof eventDialog.showModal === 'function'){
      eventDialog.showModal();
    }else{
      // Fallback for older browsers
      eventDialog.setAttribute('open', '');
    }
  }
  // Dialog button handlers
  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if(!dialogTaskId) return;
  
    const t = findTask(dialogTaskId);
    if(!t) return;
  
    // Update basic fields
    t.title = eventTitleInput.value.trim() || t.title;
    let newDuration = parseInt(eventDurationInput.value, 10) || t.duration || 60;
    if(newDuration > MAX_EVENT_DURATION) newDuration = MAX_EVENT_DURATION;
  
    // Validate duration doesn't cause overlap
    if(t.scheduledStart && hasOverlap(t.scheduledStart, newDuration, t.id)){
      alert('Updated duration overlaps another event.');
      return;
    }
    t.duration = newDuration;
  
    // Handle recurrence
    const repeatType = eventRepeatSelect ? eventRepeatSelect.value : 'none';
    if(repeatType === 'none'){
      t.recurrence = null;
    }else{
      const checked = Array.from(repeatDaysEl.querySelectorAll('input[type=checkbox]:checked'))
        .map(cb => parseInt(cb.value, 10));
    
      if(!t.scheduledStart){
        alert('Please schedule the event first. Recurrence applies to scheduled events.');
        return;
      }
    
      // Determine recurrence days based on type
      let finalDays;
      if(repeatType === 'daily'){
        finalDays = [0, 1, 2, 3, 4, 5, 6]; // All weekdays
      }else if(repeatType === 'weekly'){
        if(!t.scheduledStart){
          alert('Please schedule the event first. Weekly recurrence uses the event weekday.');
          return;
        }
        finalDays = [new Date(t.scheduledStart).getDay()]; // Same weekday as scheduled start
      }else{
        // Custom: require at least one day selected
        if(checked.length === 0){
          alert('Please pick one or more weekdays for the recurrence.');
          return;
        }
        finalDays = checked;
      }
    
      // Validate recurrence won't create overlaps
      const temp = Object.assign({}, t, { recurrence: { type: repeatType, days: finalDays } });
      const now = new Date();
      const capFuture = addDays(now, RECURRENCE_CAP_DAYS);
      const occs = generateOccurrences(temp, startOfDay(now), capFuture, capFuture);
    
      for(const occ of occs){
        const iso = occ.start.toISOString();
        if(hasOverlap(iso, t.duration || 60, t.id)){
          alert(`Recurrence would overlap another event on ${formatDate(occ.start, {weekday:'long', month:'short', day:'numeric'})} at ${formatHM(occ.start)}. Recurrence not saved.`);
          return;
        }
      }
    
      // Safe to persist
      t.recurrence = { type: repeatType, days: finalDays };
    }
  
    saveState();
    renderInbox();
    renderEvents();
    eventDialog.close();
  });
  
  unscheduleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if(!dialogTaskId) return;
    
    const t = findTask(dialogTaskId);
    if(t){
      t.scheduledStart = null;
      saveState();
      renderInbox();
      renderEvents();
    }
    eventDialog.close();
  });
  
  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if(!dialogTaskId) return;
    
    state.tasks = state.tasks.filter(x => x.id !== dialogTaskId);
    saveState();
    renderInbox();
    renderEvents();
    eventDialog.close();
  });

  /**
   * Attach handlers for recurrence UI changes
   */
  function attachDialogRepeatHandlers(){
    if(!eventRepeatSelect || !repeatDaysEl) return;
    
    eventRepeatSelect.addEventListener('change', () => {
      const v = eventRepeatSelect.value;
      
      // Daily and weekly don't need day selection; custom does
      if(v === 'daily'){
        showRepeatDays(false);
      }else if(v === 'weekly'){
        // Weekly: no need to show weekday selectors (uses scheduled day's weekday)
        showRepeatDays(false);
      }else if(v === 'custom'){
        showRepeatDays(true);
      }else{
        showRepeatDays(false);
      }
    });
  }
  
  /**
   * Show/hide weekday selection UI
   * @param {boolean} show - Whether to show the weekday selectors
   */
  function showRepeatDays(show){
    if(!repeatDaysEl) return;
    repeatDaysEl.style.display = show ? 'block' : 'none';
    repeatDaysEl.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================
  
  // Date utilities
  function startOfWeek(d){
    const x = new Date(d);
    const day = x.getDay(); // 0=Sun, 1=Mon...
    const diffToMon = (day + 6) % 7; // Days since Monday
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - diffToMon);
    return x;
  }
  
  function startOfDay(d){ 
    const x = new Date(d); 
    x.setHours(0, 0, 0, 0); 
    return x; 
  }
  
  function addDays(d, n){ 
    const x = new Date(d); 
    x.setDate(x.getDate() + n); 
    return x; 
  }
  
  function diffDays(a, b){ 
    const MS = 86400000; 
    return Math.round((startOfDay(b) - startOfDay(a)) / MS); 
  }
  
  function isSameDate(a, b){ 
    return startOfDay(a).getTime() === startOfDay(b).getTime(); 
  }
  
  function getDaysCount(){ 
    return state.viewMode === '4d' ? 4 : 7; 
  }
  
  /**
   * Get pixel height for a 30-minute slot based on current density
   * @returns {number} Pixel height
   */
  function getSlot30Px(){
    if(state.density === 'compact'){
      // Read from CSS var if set; fallback to computed fit
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot-30'));
      return isNaN(v) || v <= 0 
        ? (calendarBodyEl ? Math.max(14, Math.floor(calendarBodyEl.clientHeight / 48)) : 16) 
        : v;
    }
    switch(state.density){
      case 'relaxed': return 32; // 64px per hour
      case 'cozy':
      default: return 24; // 48px per hour
    }
  }
  
  /**
   * Check if task matches current filter text
   * @param {Object} task - Task to check
   * @returns {boolean} True if task matches filter
   */
  function matchesFilter(task){
    const q = (state.filterText || '').trim().toLowerCase();
    if(!q) return true;
    return (task.title || '').toLowerCase().includes(q);
  }
  
  function attachSearchHandler(){
    if(!searchInput) return;
    searchInput.value = state.filterText || '';
    searchInput.addEventListener('input', () => {
      state.filterText = searchInput.value || '';
      renderInbox();
      renderEvents();
      saveState();
    });
  }
  
  // Formatting utilities
  function pad(n){ 
    return String(n).padStart(2, '0'); 
  }
  
  function formatHM(d){ 
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`; 
  }
  
  function formatDate(d, opts){ 
    return new Intl.DateTimeFormat(undefined, opts).format(d); 
  }
  
  function durationLabel(mins){ 
    if(mins % 60 === 0) return `${mins / 60}h`; 
    if(mins < 60) return `${mins}m`; 
    return `${Math.floor(mins / 60)}h ${mins % 60}m`; 
  }
  
  function uid(){ 
    return Math.random().toString(36).slice(2, 10); 
  }
  
  function findTask(id){ 
    return state.tasks.find(t => t.id === id); 
  }
  
  /**
   * Generate a consistent color for a task based on its ID
   * @param {string} id - Task ID
   * @returns {string} HSL color string
   */
  function colorFromId(id){
    let h = 0; 
    for(const ch of id){ 
      h = (h * 31 + ch.charCodeAt(0)) % 360; 
    }
    return `hsl(${h} 85% 65%)`;
  }
  // ========================================
  // DRAG & DROP HELPERS
  // ========================================
  
  function hasPlannerData(e){
    if(!e.dataTransfer) return false;
    try{ return e.dataTransfer.types.includes('application/json'); }catch{ return false; }
  }
  
  function readPlannerData(e){
    try{
      const str = e.dataTransfer.getData('application/json');
      if(!str) return null;
      return JSON.parse(str);
    }catch{ return null; }
  }
  
  // ========================================
  // RECURRENCE & OVERLAP LOGIC
  // ========================================
  
  /**
   * Generate all occurrences of a recurring task within a time window
   * Only generates occurrences after the anchor (original scheduled event)
   * Respects recurrence cap date
   * @param {Object} task - Task with recurrence property
   * @param {Date} windowStart - Start of window to generate occurrences
   * @param {Date} windowEnd - End of window to generate occurrences
   * @param {Date} capDate - Maximum date for any occurrence
   * @returns {Array<{key: string, parent: Object, start: Date}>} Array of occurrence objects
   */
  function generateOccurrences(task, windowStart, windowEnd, capDate){
    const out = [];
    if(!task.recurrence || !task.scheduledStart) return out;
    
    const days = Array.isArray(task.recurrence.days) ? task.recurrence.days : [];
    if(days.length === 0) return out;
    
    const anchor = new Date(task.scheduledStart);
    const hour = anchor.getHours();
    const minute = anchor.getMinutes();
    
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    const cap = capDate ? new Date(capDate) : addDays(new Date(), RECURRENCE_CAP_DAYS);
    const actualEnd = end < cap ? end : cap;
    
    // Loop day-by-day from windowStart to actualEnd
    for(let d = new Date(start); d < actualEnd; d.setDate(d.getDate() + 1)){
      const wd = d.getDay();
      if(days.indexOf(wd) === -1) continue; // Skip if day of week not in recurrence pattern
      
      const occ = new Date(d);
      occ.setHours(hour, minute, 0, 0);
      
      // Only include occurrences strictly after the anchor (anchor shown as original event)
      if(occ <= anchor) continue;
      if(occ >= actualEnd) continue;
      
      out.push({ 
        key: `${task.id}::${occ.toISOString().slice(0, 10)}`, 
        parent: task, 
        start: new Date(occ) 
      });
    }
    return out;
  }
  
  /**
   * Check if a proposed time slot overlaps with any existing events or recurring occurrences
   * @param {string} startISO - Proposed event start time (ISO string)
   * @param {number} durationMin - Proposed event duration in minutes
   * @param {string|null} excludeId - Task ID to exclude from check (for editing existing task)
   * @returns {boolean} True if overlap detected
   */
  function hasOverlap(startISO, durationMin, excludeId){
    try{
      const start = new Date(startISO);
      const end = new Date(start.getTime() + (durationMin || 60) * 60000);
      
      // Check concrete scheduled tasks
      for(const t of state.tasks){
        if(!t.scheduledStart) continue;
        if(excludeId && t.id === excludeId) continue;
        
        const s2 = new Date(t.scheduledStart);
        const e2 = new Date(s2.getTime() + (t.duration || 60) * 60000);
        if(start < e2 && end > s2) return true;
      }
      
      // Also check generated occurrences of recurring tasks (within recurrence cap)
      const now = new Date();
      const capFuture = addDays(now, RECURRENCE_CAP_DAYS);
      const windowStart = addDays(startOfDay(now), -1);
      const windowEnd = capFuture;
      
      for(const t of state.tasks){
        if(t.recurrence && t.scheduledStart){
          const occs = generateOccurrences(t, windowStart, windowEnd, capFuture);
          for(const occ of occs){
            if(excludeId && occ.parent.id === excludeId) continue;
            
            const s2 = occ.start;
            const e2 = new Date(s2.getTime() + (occ.parent.duration || 60) * 60000);
            if(start < e2 && end > s2) return true;
          }
        }
      }
      return false;
    }catch{ 
      return false; 
    }
  }
  
  // ========================================
  // UI HELPERS
  // ========================================
  
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, function(c){
      switch(c){
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }
  
  function trashSvg(label){
    return `<span class="sr-only">${escapeHtml(label)}</span><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></svg>`;
  }
})();

// Keyboard shortcuts (global)
document.addEventListener('keydown', (e)=>{
  const titleInput = document.getElementById('taskTitle');
  if(!titleInput) return;
  if(e.key === 'n' && !e.metaKey && !e.ctrlKey){
    titleInput.focus();
    e.preventDefault();
  }
  if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){
    // submit add form if title populated
    const form = document.getElementById('addTaskForm');
    if(titleInput.value.trim() && form){
      form.requestSubmit();
      e.preventDefault();
    }
  }
});
