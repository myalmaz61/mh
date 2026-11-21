/** Pure validation and local diagnostic counts; no mutation or deletion. */
import { validTasksData, emptyTasks } from './tasks-core.js';
import { validCalendarData, emptyCalendar } from './calendar-core.js';
import { validBookmarks, emptyBookmarks } from './bookmarks-core.js';
export function dataHealth({ notes, tasksData, calendarData, bookmarksData }) {
  if(!Array.isArray(notes))throw Error('Notes unavailable');
  const tasks=tasksData===undefined?emptyTasks():tasksData;
  const calendar=calendarData===undefined?emptyCalendar():calendarData;
  const bookmarks=bookmarksData===undefined?emptyBookmarks():bookmarksData;
  if(!validTasksData(tasks)||!validCalendarData(calendar)||!validBookmarks(bookmarks))throw Error('Invalid local data');
  return {notes:notes.length,tasks:tasks.tasks.length,events:calendar.events.length,bookmarks:bookmarks.items.length};
}
export function formatBytes(bytes,lang='bg'){
  if(!Number.isFinite(bytes)||bytes<0)return '—';
  const value=bytes>=1048576?bytes/1048576:bytes/1024;
  const unit=bytes>=1048576?'MB':'KB';
  return `${new Intl.NumberFormat(lang==='en'?'en-GB':'bg-BG',{maximumFractionDigits:1}).format(value)} ${unit}`;
}
