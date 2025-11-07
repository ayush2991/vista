# Planner: Inbox → Calendar (Beginner-friendly)

A simple, beautiful web app that keeps unscheduled TODOs in an Inbox and lets you plan them on a week calendar. Built with just HTML, CSS, and vanilla JavaScript. No frameworks, no build step.

## Features

- Inbox for tasks that aren’t scheduled yet
- Week calendar with 30-minute slots
- Drag from Inbox → drop onto the calendar to schedule
- Move scheduled tasks by dragging to a new slot
- Unschedule by dropping back into the Inbox area
- Quick edit dialog for title and duration, plus delete
- LocalStorage persistence (your data stays in the browser)

## Project structure

- `index.html` — Main page
- `styles.css` — Styling (dark theme, clean layout)
- `app.js` — Logic (rendering, drag-and-drop, storage)

## Run locally

No dependencies. You can open `index.html` directly in a browser. For best results (and to avoid any browser security quirks), serve it over a tiny local server:

```bash
# From this folder
python3 -m http.server 5173
# Then open http://localhost:5173 in your browser
```

## How it works

- Tasks live in LocalStorage under a single key. A task looks like:
  ```json
  { "id": "abc123", "title": "Write notes", "duration": 60, "scheduledStart": null }
  ```
- Scheduling sets `scheduledStart` to an ISO timestamp. The calendar renders any tasks that fall in the current week.
- The calendar snaps to 30-minute increments. Default duration is 60 minutes (configurable per task).

## Tips

- Use the header controls to switch weeks or jump to Today.
- Click a scheduled task to quickly edit its title or duration.
- Drag a scheduled task into the Inbox panel to unschedule it.

## Next ideas

- Resizing events to change duration directly on the calendar
- Daily and monthly views
- Simple search and tags
- Export/import JSON

Enjoy planning! 🎯
