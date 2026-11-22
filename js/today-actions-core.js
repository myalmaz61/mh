/** Safe, pure transition for the Today widget; never mutate the stored list. */
import {validTasksData} from './tasks-core.js';

export function completeTodayTaskData(data, id, expectedUpdatedAt, now) {
  if (!validTasksData(data)) throw Object.assign(Error('Damaged tasks'), {code:'corrupt'});
  if (typeof id !== 'string' || typeof expectedUpdatedAt !== 'string')
    throw Object.assign(Error('Invalid task selection'), {code:'invalid'});
  const task=data.tasks.find(item=>item.id===id);
  if (!task) throw Object.assign(Error('Task not found'), {code:'missing'});
  if (task.done) throw Object.assign(Error('Task already completed'), {code:'completed'});
  if (task.updatedAt!==expectedUpdatedAt)
    throw Object.assign(Error('Task changed in another view'), {code:'stale'});
  if (typeof now!=='string' || !Number.isFinite(Date.parse(now)) ||
      !/^\d{4}-\d{2}-\d{2}T/.test(now) || now.length>32)
    throw Object.assign(Error('Invalid timestamp'), {code:'invalid'});
  const next={schema:1,tasks:data.tasks.map(item=>item.id===id?{...item,done:true,updatedAt:now}:item)};
  if (!validTasksData(next)) throw Object.assign(Error('Invalid task update'), {code:'invalid'});
  return next;
}
